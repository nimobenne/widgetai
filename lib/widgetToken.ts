import { createHmac, timingSafeEqual } from 'node:crypto';
import { requiredEnv } from './observability';

function secret(): string {
  return requiredEnv('WIDGET_SIGNING_SECRET');
}

export function signWidgetToken(params: { siteId: string; host: string; ttlSeconds?: number }): string {
  const payload = Buffer.from(JSON.stringify({ siteId: params.siteId, host: params.host, exp: Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 3600) })).toString('base64url');
  return `${payload}.${createHmac('sha256', secret()).update(payload).digest('base64url')}`;
}

export function verifyWidgetToken(token: string | null, expected: { siteId: string; host: string }, options?: { graceSeconds?: number }): { ok: boolean } {
  try {
    if (!token) return { ok: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { ok: false };
    const [payload, signature] = parts;
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(createHmac('sha256', secret()).update(payload).digest('base64url'));
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return { ok: false };
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return { ok: parsed.siteId === expected.siteId && parsed.host === expected.host && Number.isSafeInteger(parsed.exp) && parsed.exp > Math.floor(Date.now() / 1000) - (options?.graceSeconds ?? 0) };
  } catch { return { ok: false }; }
}
