import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { NextRequest } from 'next/server';
import { ConfigurationError, logFailure } from '../lib/observability';
import { createChatHandler } from '../lib/chat';
import { runAssistant } from '../lib/ai';
import { MemoryStore } from '../lib/store';
import { signWidgetToken } from '../lib/widgetToken';
import { POST as refresh } from '../app/api/widget/token/refresh/route';
import { GET as config } from '../app/api/widget/config/route';
import { GET as prune } from '../app/api/cron/prune/route';

test('logs contain only fixed error categories, safe reasons and upstream statuses', t => {
  const logs: string[] = [];
  t.mock.method(console, 'error', (line: string) => logs.push(line));
  const privateText = 'private prompt ip session token upstream body';
  const upstream = new OpenAI.APIError(401, { message: privateText }, privateText, new Headers());
  logFailure('/api/chat', upstream, 'openai');
  assert.deepEqual(JSON.parse(logs[0]), { level: 'error', route: '/api/chat', errorClass: 'APIError', status: 401, reason: 'openai_401' });
  logFailure('/api/chat', new OpenAI.APIConnectionTimeoutError({ message: privateText }), 'openai');
  assert.equal(JSON.parse(logs[1]).reason, 'openai_timeout');
  logFailure('/api/chat', Object.assign(new Error(privateText), { code: 'ETIMEDOUT', name: privateText, detail: privateText }), 'db');
  assert.deepEqual(JSON.parse(logs[2]), { level: 'error', route: '/api/chat', errorClass: 'DatabaseError', reason: 'db_timeout' });
  logFailure('/api/chat', { name: privateText, status: privateText, message: privateText });
  assert.equal(JSON.parse(logs[3]).errorClass, 'UnknownError');
  logFailure('/api/chat', new ConfigurationError('MONTHLY_MESSAGE_CAP', 'invalid'));
  assert.equal(JSON.parse(logs[4]).reason, 'invalid_monthly_message_cap');
  for (const line of logs) assert.doesNotMatch(line, /private|prompt|session|token|upstream body/);
});

test('SDK response errors retain safe status logging without upstream details or retries', async t => {
  const logs: string[] = [];
  t.mock.method(console, 'error', (line: string) => logs.push(line));
  const privateText = 'private prompt token upstream body';
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const client = new OpenAI({
      apiKey: 'test-key', maxRetries: 0, timeout: 15_000,
      fetch: async () => {
        calls++;
        return Response.json({ error: { message: privateText } }, {
          status, headers: { 'x-request-id': privateText }
        });
      }
    });
    await assert.rejects(client.chat.completions.create({
      model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'Projects?' }], max_tokens: 300
    }), error => {
      assert.ok(error instanceof OpenAI.APIError);
      logFailure('/api/chat', error, 'openai');
      return true;
    });
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(logs.at(-1)!), {
      level: 'error', route: '/api/chat', errorClass: 'APIError', status, reason: `openai_${status}`
    });
  }
  for (const line of logs) assert.doesNotMatch(line, /private|prompt|token|upstream body/);
});

test('first requests report missing required env names without leaking request data', async t => {
  const logs: string[] = [];
  t.mock.method(console, 'error', (line: string) => logs.push(line));
  process.env.CHAT_ENABLED = 'true';
  process.env.WIDGET_SIGNING_SECRET = 'test-secret';
  process.env.IP_SALT = 'test-salt';
  delete process.env.OPENAI_API_KEY;
  delete process.env.DATABASE_URL;
  delete process.env.DAILY_MESSAGE_CAP;
  const token = signWidgetToken({ siteId: 'nimo', host: 'localhost' });
  const req = () => new NextRequest('http://localhost/api/chat', {
    method: 'POST', headers: { 'x-widget-token': token, 'x-forwarded-for': '192.0.2.7' },
    body: JSON.stringify({ siteId: 'nimo', sessionId: 'private-session', message: 'private-question' })
  });
  t.mock.method(OpenAI.Chat.Completions.prototype, 'create', async () => { throw Error('Unexpected model call'); });
  const store = new MemoryStore();
  const handler = createChatHandler({ getStore: () => store, runAssistant });
  for (const value of [undefined, '', '   ']) {
    if (value === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = value;
    assert.equal((await handler(req())).status, 503);
    assert.equal(JSON.parse(logs.at(-1)!).reason, 'missing_openai_api_key');
  }
  delete process.env.IP_SALT;
  assert.equal((await handler(req())).status, 503);
  assert.equal(JSON.parse(logs.at(-1)!).reason, 'missing_ip_salt');
  process.env.IP_SALT = 'test-salt';
  const previous = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: 'production' });
  assert.equal((await createChatHandler()(req())).status, 503);
  assert.equal(JSON.parse(logs.at(-1)!).reason, 'missing_database_url');
  if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
  else Object.assign(process.env, { NODE_ENV: previous });
  delete process.env.WIDGET_SIGNING_SECRET;
  assert.equal((await handler(req())).status, 503);
  assert.equal(JSON.parse(logs.at(-1)!).reason, 'missing_widget_signing_secret');
  assert.equal((await refresh(req())).status, 503);
  assert.equal(JSON.parse(logs.at(-1)!).route, '/api/widget/token/refresh');
  assert.equal((await config(new NextRequest('http://localhost/api/widget/config?siteId=nimo'))).status, 503);
  assert.equal(JSON.parse(logs.at(-1)!).route, '/api/widget/config');
  delete process.env.CRON_SECRET;
  assert.equal((await prune(new NextRequest('http://localhost/api/cron/prune'))).status, 401);
  assert.equal(JSON.parse(logs.at(-1)!).reason, 'missing_cron_secret');
  for (const line of logs) {
    assert.doesNotMatch(line, /private-question|private-session|192\.0\.2\.7|test-secret|test-salt/);
    assert.ok(!line.includes(token));
  }
});

test('chat records whether the failure came from reservations, model calls or question writes', async t => {
  const logs: string[] = [];
  t.mock.method(console, 'error', (line: string) => logs.push(line));
  process.env.CHAT_ENABLED = 'true';
  process.env.WIDGET_SIGNING_SECRET = 'test-secret';
  process.env.IP_SALT = 'test-salt';
  const req = () => new NextRequest('http://localhost/api/chat', {
    method: 'POST', headers: { 'x-widget-token': signWidgetToken({ siteId: 'nimo', host: 'localhost' }) },
    body: JSON.stringify({ siteId: 'nimo', sessionId: 's', message: 'Projects?' })
  });
  for (const stage of ['reservation', 'model', 'question']) {
    const handler = createChatHandler({
      getStore: () => ({
        reserveUsage: async () => { if (stage === 'reservation') throw Object.assign(Error('private'), { code: '57014' }); return true; },
        logQuestion: async () => { throw Error('private'); },
        prune: async () => ({ counters: 0, questions: 0 })
      }),
      runAssistant: async () => {
        if (stage === 'model') throw new OpenAI.APIError(429, {}, 'private', new Headers());
        return { message: 'Projects', sources: [], answered: true };
      }
    });
    assert.equal((await handler(req())).status, 503);
    assert.equal(JSON.parse(logs.at(-1)!).reason, stage === 'reservation' ? 'db_timeout' : stage === 'model' ? 'openai_429' : 'db_error');
  }
});
