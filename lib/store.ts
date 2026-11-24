import { neon } from '@neondatabase/serverless';
import type { UsageInput } from './types';
import { ConfigurationError } from './observability';

export interface DataStore {
  reserveUsage(input: UsageInput): Promise<boolean>;
  logQuestion(siteId: string, question: string, answered: boolean): Promise<void>;
  prune(): Promise<{ counters: number; questions: number }>;
}

export type Query = (text: string, params: unknown[]) => Promise<Record<string, unknown>[]>;

export class PostgresStore implements DataStore {
  constructor(private query: Query) {}

  async reserveUsage(input: UsageInput): Promise<boolean> {
    // Lock global windows first; rejected traffic cannot create fresh IP or session rows.
    const rows = await this.query(`
      WITH windows(key, cap, expires_at) AS (
        VALUES
          ('ip:minute:' || $1 || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD-HH24-MI'), 5,
            date_trunc('minute', now()) + interval '1 minute'),
          ('ip:day:' || $1 || ':' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), 30,
            (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC'),
          ('global:day:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'), $3::int,
            (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC'),
          ('global:month:' || to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM'), $4::int,
            (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC')
      ), globals AS (
        INSERT INTO usage_counters(key, count, expires_at)
        SELECT key, 1, expires_at FROM windows WHERE key LIKE 'global:%' ORDER BY key
        ON CONFLICT (key) DO UPDATE SET count = LEAST(usage_counters.count::bigint + 1, 2147483647)::int
        RETURNING key, count
      ), ips AS (
        INSERT INTO usage_counters(key, count, expires_at)
        SELECT key, 1, expires_at FROM windows
        WHERE key LIKE 'ip:%' AND (SELECT count(*) = 2 AND bool_and(g.count <= w.cap) FROM globals g JOIN windows w USING (key))
        ORDER BY key
        ON CONFLICT (key) DO UPDATE SET count = LEAST(usage_counters.count::bigint + 1, 2147483647)::int
        RETURNING key, count
      ), session AS (
        INSERT INTO usage_counters(key, count, expires_at)
        SELECT 'session:' || $2, 1, now() + interval '24 hours'
        WHERE (SELECT count(*) = 2 AND bool_and(i.count <= w.cap) FROM ips i JOIN windows w USING (key))
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN usage_counters.expires_at <= now() THEN 1 ELSE LEAST(usage_counters.count::bigint + 1, 2147483647)::int END,
          expires_at = CASE WHEN usage_counters.expires_at <= now() THEN EXCLUDED.expires_at ELSE usage_counters.expires_at END
        RETURNING count
      )
      SELECT count(*) = 1 AND bool_and(count <= 20) AS allowed FROM session
    `, [input.ipHash, input.sessionHash, input.dailyCap, input.monthlyCap]);
    return rows.length === 1 && rows[0].allowed === true;
  }

  async logQuestion(siteId: string, question: string, answered: boolean): Promise<void> {
    await this.query('INSERT INTO questions(site_id, question, answered) VALUES ($1, $2, $3)', [siteId, question.slice(0, 500), answered]);
  }

  async prune() {
    const rows = await this.query(`
      WITH counters AS (DELETE FROM usage_counters WHERE expires_at <= now() RETURNING 1),
      questions AS (DELETE FROM questions WHERE created_at < now() - interval '30 days' RETURNING 1)
      SELECT (SELECT count(*)::int FROM counters) AS counters, (SELECT count(*)::int FROM questions) AS questions
    `, []);
    if (rows.length !== 1) throw new Error('Pruning failed');
    return { counters: Number(rows[0].counters), questions: Number(rows[0].questions) };
  }
}

export class MemoryStore implements DataStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();
  readonly questions: { site_id: string; question: string; answered: boolean; created_at: Date }[] = [];
  constructor(private clock = () => new Date()) {}

  async reserveUsage(input: UsageInput): Promise<boolean> {
    const now = this.clock();
    const day = now.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const nextDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    const windows: [string, number, number][] = [
      [`ip:minute:${input.ipHash}:${now.toISOString().slice(0, 16)}`, 5, Math.floor(now.getTime() / 60000) * 60000 + 60000],
      [`ip:day:${input.ipHash}:${day}`, 30, nextDay],
      [`global:day:${day}`, input.dailyCap, nextDay],
      [`global:month:${month}`, input.monthlyCap, Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)]
    ];
    const increment = ([key, cap, expiresAt]: [string, number, number]) => {
      const previous = this.counters.get(key);
      const active = previous && previous.expiresAt > now.getTime();
      const count = active ? Math.min(previous.count + 1, 2147483647) : 1;
      if (active) expiresAt = previous.expiresAt;
      this.counters.set(key, { count, expiresAt });
      return count <= cap;
    };
    if (!windows.slice(2).map(increment).every(Boolean)) return false;
    if (!windows.slice(0, 2).map(increment).every(Boolean)) return false;
    return increment([`session:${input.sessionHash}`, 20, now.getTime() + 86400000]);
  }

  async logQuestion(siteId: string, question: string, answered: boolean) {
    this.questions.push({ site_id: siteId, question: question.slice(0, 500), answered, created_at: this.clock() });
  }

  async prune() {
    const now = this.clock().getTime();
    let counters = 0;
    for (const [key, counter] of this.counters) {
      if (counter.expiresAt <= now) { this.counters.delete(key); counters++; }
    }
    const before = this.questions.length;
    const retained = this.questions.filter(question => question.created_at.getTime() >= now - 30 * 86400000);
    this.questions.splice(0, this.questions.length, ...retained);
    return { counters, questions: before - retained.length };
  }
}

const memoryStore = new MemoryStore();
let postgres: { url: string; store: DataStore } | undefined;
export function getStore(): DataStore {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    if (postgres?.url !== url) {
      const sql = neon(url);
      postgres = { url, store: new PostgresStore((text, params) => sql.query(text, params)) };
    }
    return postgres.store;
  }
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) throw new ConfigurationError('DATABASE_URL');
  return memoryStore;
}
