import { createHash } from 'node:crypto';
import type { UsageInput } from './types';
import { ConfigurationError, requiredEnv } from './observability';

function cap(name: 'DAILY_MESSAGE_CAP' | 'MONTHLY_MESSAGE_CAP', fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2_147_483_646) {
    throw new ConfigurationError(name, 'invalid');
  }
  return Number(value);
}

export function usageInput(headers: Headers, siteId: string, sessionId: string): UsageInput {
  const salt = requiredEnv('IP_SALT');
  const ip = ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']
    .map(name => headers.get(name)?.split(',')[0].trim()).find(Boolean) || 'unknown';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  return {
    ipHash: hash(`${ip}${salt}`),
    sessionHash: hash(JSON.stringify([siteId, sessionId])),
    dailyCap: cap('DAILY_MESSAGE_CAP', 60),
    monthlyCap: cap('MONTHLY_MESSAGE_CAP', 1200)
  };
}
