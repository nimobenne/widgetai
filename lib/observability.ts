import OpenAI from 'openai';

type EnvName = 'OPENAI_API_KEY' | 'WIDGET_SIGNING_SECRET' | 'IP_SALT' | 'DATABASE_URL' | 'CRON_SECRET' | 'DAILY_MESSAGE_CAP' | 'MONTHLY_MESSAGE_CAP';
export type FailureService = 'request' | 'db' | 'openai';

export class ConfigurationError extends Error {
  constructor(readonly variable: EnvName, readonly kind: 'missing' | 'invalid' = 'missing') {
    super(`${variable} is ${kind}`);
  }
}

export function requiredEnv(name: EnvName): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ConfigurationError(name);
  return value;
}

// Only fixed categories and numeric statuses leave this boundary, never error text or bodies.
export function logFailure(route: string, error: unknown, service: FailureService = 'request'): void {
  let errorClass = error instanceof Error ? 'Error' : 'UnknownError';
  let reason: string = `${service}_error`;
  let status: number | undefined;
  if (error instanceof ConfigurationError) {
    errorClass = 'ConfigurationError';
    reason = `${error.kind}_${error.variable.toLowerCase()}`;
  } else if (error instanceof OpenAI.APIError) {
    errorClass = error instanceof OpenAI.APIConnectionTimeoutError ? 'APIConnectionTimeoutError'
      : error instanceof OpenAI.APIConnectionError ? 'APIConnectionError' : 'APIError';
    if (Number.isInteger(error.status) && error.status! >= 400 && error.status! <= 599) status = error.status;
    reason = status ? `openai_${status}` : error instanceof OpenAI.APIConnectionTimeoutError ? 'openai_timeout' : 'openai_connection';
  } else if (error instanceof Error) {
    // Database drivers use these codes; never copy their message, detail, or query.
    const code = 'code' in error ? error.code : undefined;
    if (service === 'db' && (code === 'ETIMEDOUT' || code === '57014')) {
      errorClass = 'DatabaseError';
      reason = 'db_timeout';
    } else if (service === 'db') errorClass = 'DatabaseError';
    else if (error instanceof TypeError) errorClass = 'TypeError';
    else if (error instanceof SyntaxError) errorClass = 'SyntaxError';
  }
  console.error(JSON.stringify({ level: 'error', route, errorClass, status, reason }));
}
