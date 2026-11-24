import assert from 'node:assert/strict';
import test from 'node:test';
import { MemoryStore, PostgresStore, getStore } from '../lib/store';
import { usageInput } from '../lib/limits';

const now = new Date('2026-01-31T12:00:00Z');
const input = (ip = 'ip', session = 'session') => ({ ipHash: ip, sessionHash: session, dailyCap: 200, monthlyCap: 3000 });

test('global caps default to 60 daily and 1200 monthly while preserving explicit overrides', t => {
  const names = ['IP_SALT', 'DAILY_MESSAGE_CAP', 'MONTHLY_MESSAGE_CAP'] as const;
  const previous = names.map(name => process.env[name]);
  t.after(() => names.forEach((name, i) => {
    if (previous[i] === undefined) delete process.env[name];
    else process.env[name] = previous[i];
  }));
  process.env.IP_SALT = 'test-salt';
  for (const value of [undefined, '']) {
    for (const name of names.slice(1)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const limits = usageInput(new Headers(), 'widgetai', 's');
    assert.equal(limits.dailyCap, 60);
    assert.equal(limits.monthlyCap, 1200);
  }
  process.env.DAILY_MESSAGE_CAP = '0';
  process.env.MONTHLY_MESSAGE_CAP = '7';
  const limits = usageInput(new Headers(), 'widgetai', 's');
  assert.equal(limits.dailyCap, 0);
  assert.equal(limits.monthlyCap, 7);
});

test('IP minute cap permits five reservations under concurrency', async () => {
  const store = new MemoryStore(() => now);
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => store.reserveUsage(input('ip', String(i)))));
  assert.equal(results.filter(Boolean).length, 5);
});

test('IP UTC day cap permits thirty across minute windows, resets at midnight', async () => {
  let clock = now;
  const store = new MemoryStore(() => clock);
  for (let i = 0; i < 30; i++) {
    clock = new Date(now.getTime() + i * 60000);
    assert.equal(await store.reserveUsage(input('ip', String(i))), true);
  }
  clock = new Date(now.getTime() + 31 * 60000);
  assert.equal(await store.reserveUsage(input('ip', 'other')), false);
  clock = new Date('2026-02-01T00:00:00Z');
  assert.equal(await store.reserveUsage(input('ip', 'new')), true);
});

test('session cap permits twenty across IPs, expires after 24 hours without needing prune', async () => {
  let clock = now;
  const store = new MemoryStore(() => clock);
  for (let i = 0; i < 20; i++) assert.equal(await store.reserveUsage(input(String(i))), true);
  assert.equal(await store.reserveUsage(input('another')), false);
  clock = new Date(now.getTime() + 86400000 - 1);
  assert.equal(await store.reserveUsage(input('another')), false);
  clock = new Date(now.getTime() + 86400000);
  assert.equal(await store.reserveUsage(input('another')), true);
});

test('global daily and monthly caps apply across IPs and sessions', async () => {
  let clock = now;
  const store = new MemoryStore(() => clock);
  const reserve = (i: number) => store.reserveUsage({ ...input(String(i), String(i)), dailyCap: 2, monthlyCap: 4 });
  assert.equal(await reserve(1), true);
  assert.equal(await reserve(2), true);
  assert.equal(await reserve(3), false);
  clock = new Date('2026-02-01T00:00:00Z');
  assert.equal(await reserve(4), true);
  assert.equal(await reserve(5), true);
  clock = new Date('2026-02-02T00:00:00Z');
  assert.equal(await reserve(6), true);
  assert.equal(await reserve(7), true);
  clock = new Date('2026-02-03T00:00:00Z');
  assert.equal(await reserve(8), false);
});

test('IP uses first forwarded hop and salt; session keys contain no raw session', () => {
  process.env.IP_SALT = 'test-salt';
  const a = usageInput(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }), 'nimo', 'session');
  assert.equal(a.ipHash, usageInput(new Headers({ 'x-forwarded-for': '1.2.3.4' }), 'widgetai', 'other').ipHash);
  assert.match(a.ipHash, /^[a-f0-9]{64}$/);
  assert.match(a.sessionHash, /^[a-f0-9]{64}$/);
  delete process.env.IP_SALT;
  assert.throws(() => usageInput(new Headers(), 'nimo', 's'));
});

test('IP headers prefer Vercel, then real IP, then forwarded IP, skipping empty hops', () => {
  process.env.IP_SALT = 'test-salt';
  const hash = (values: Record<string, string>) => usageInput(new Headers(values), 'nimo', 's').ipHash;
  const expected = hash({ 'x-forwarded-for': '192.0.2.1' });
  assert.equal(hash({ 'x-vercel-forwarded-for': '192.0.2.1, 10.0.0.1', 'x-real-ip': '192.0.2.2', 'x-forwarded-for': '192.0.2.3' }), expected);
  assert.equal(hash({ 'x-real-ip': '192.0.2.1', 'x-forwarded-for': '192.0.2.3' }), expected);
  assert.equal(hash({ 'x-vercel-forwarded-for': ' ', 'x-real-ip': '192.0.2.1' }), expected);
  assert.equal(hash({ 'x-vercel-forwarded-for': ', 10.0.0.1', 'x-real-ip': '', 'x-forwarded-for': '192.0.2.1' }), expected);
  assert.match(hash({}), /^[a-f0-9]{64}$/);
});

test('Postgres atomically gates IP and session upserts; errors and malformed replies fail closed', async () => {
  let calls = 0;
  const store = new PostgresStore(async (sql, params) => {
    calls++;
    assert.match(sql, /ON CONFLICT[\s\S]+RETURNING/i);
    assert.match(sql, /AT TIME ZONE 'UTC'/);
    assert.match(sql, /FROM globals g JOIN windows/);
    assert.match(sql, /FROM ips i JOIN windows/);
    assert.match(sql, /now\(\) \+ interval '24 hours'/);
    assert.match(sql, /expires_at <= now\(\) THEN 1/);
    assert.doesNotMatch(sql, /infinity/);
    assert.deepEqual(params, ['ip', 'session', 200, 3000]);
    return [{ allowed: true }];
  });
  assert.equal(await store.reserveUsage(input()), true);
  assert.equal(calls, 1);
  assert.equal(await new PostgresStore(async () => []).reserveUsage(input()), false);
  await assert.rejects(new PostgresStore(async () => { throw Error('DB down'); }).reserveUsage(input()));
});

test('production without DATABASE_URL never falls back to memory', () => {
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  delete process.env.DATABASE_URL;
  assert.throws(getStore, /DATABASE_URL/);
  if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, { NODE_ENV: previous });
});

test('question log truncates and prunes after thirty days with expired counters', async () => {
  let clock = now;
  const store = new MemoryStore(() => clock);
  await store.logQuestion('nimo', 'q'.repeat(600), false);
  assert.equal(store.questions[0].question.length, 500);
  assert.deepEqual(Object.keys(store.questions[0]).sort(), ['answered', 'created_at', 'question', 'site_id']);
  await store.reserveUsage(input());
  clock = new Date('2026-03-03T00:00:00Z');
  assert.deepEqual(await store.prune(), { counters: 5, questions: 1 });
});

test('rejected traffic cannot create fresh session or IP rows beyond the gates', async () => {
  // Inspect retained rows through pruning after every expiry.
  let clock = now;
  const expiring = new MemoryStore(() => clock);
  for (let i = 0; i < 100; i++) await expiring.reserveUsage(input('ip', String(i)));
  clock = new Date('2026-03-03T00:00:00Z');
  assert.equal((await expiring.prune()).counters, 9); // four shared windows, five admitted sessions
  let blockedClock = now;
  const capped = new MemoryStore(() => blockedClock);
  for (let i = 0; i < 100; i++) await capped.reserveUsage({ ...input(String(i), String(i)), monthlyCap: 0 });
  blockedClock = clock;
  assert.equal((await capped.prune()).counters, 2);
});

test('schema migrates legacy infinite sessions only and stays idempotent', async () => {
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile('db/schema.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS usage_counters/);
  assert.match(sql, /UPDATE usage_counters SET expires_at = now\(\) \+ interval '24 hours'\s+WHERE key LIKE 'session:%' AND expires_at = 'infinity'::timestamptz/);
});
