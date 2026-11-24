import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { createChatHandler } from '../lib/chat';
import { MemoryStore } from '../lib/store';
import { signWidgetToken } from '../lib/widgetToken';
import { domainAllowed } from '../lib/domainCheck';
import { GET as config, OPTIONS as configOptions } from '../app/api/widget/config/route';
import { POST as refresh, OPTIONS as refreshOptions } from '../app/api/widget/token/refresh/route';
import { GET as prune } from '../app/api/cron/prune/route';
import { widgetOptions } from '../lib/widgetHttp';
import { usageInput } from '../lib/limits';

beforeEach(() => {
  process.env.WIDGET_SIGNING_SECRET = 'test-signing-secret';
  process.env.IP_SALT = 'test-ip-salt';
  process.env.CHAT_ENABLED = 'true';
  delete process.env.DATABASE_URL;
  delete process.env.DAILY_MESSAGE_CAP;
  delete process.env.MONTHLY_MESSAGE_CAP;
});

const payload = { siteId: 'nimo', sessionId: 'test-session', message: 'What projects has Nimo built?' };
function request(body: unknown = payload, headers: Record<string, string> = {}) {
  return new NextRequest('https://chat-bot-widget-two.vercel.app/api/chat', {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { origin: 'https://nimobenne.github.io', 'x-widget-token': signWidgetToken({ siteId: 'nimo', host: 'nimobenne.github.io' }), ...headers }
  });
}

function harness(options: { dbError?: boolean; allowed?: boolean; modelError?: boolean } = {}) {
  const store = new MemoryStore();
  let dbCalls = 0;
  let modelCalls = 0;
  const handler = createChatHandler({
    getStore: () => ({
      reserveUsage: async () => { dbCalls++; if (options.dbError) throw Error('private DB error'); return options.allowed ?? true; },
      logQuestion: store.logQuestion.bind(store), prune: store.prune.bind(store)
    }),
    runAssistant: async () => {
      assert.equal(dbCalls, 1);
      modelCalls++;
      if (options.modelError) throw Error('private model error');
      return { message: 'Projects [here](https://nimobenne.github.io/#projects)', sources: [{ title: 'Projects', url: 'https://nimobenne.github.io/#projects' }], answered: true };
    }
  });
  return { handler, store, dbCalls: () => dbCalls, modelCalls: () => modelCalls };
}

test('chat reserves before model call and stores only the question fields', async () => {
  const h = harness();
  const response = await h.handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(await response.json()).sort(), ['message', 'sources']);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://nimobenne.github.io');
  assert.equal(h.modelCalls(), 1);
  assert.equal(h.store.questions[0].question, payload.message);
  assert.equal(h.store.questions[0].answered, true);
});

test('chat passes trusted headers to reservation so spoofed forwarded IPs share a cap', async () => {
  const store = new MemoryStore();
  const hashes: string[] = [];
  let modelCalls = 0;
  const handler = createChatHandler({
    getStore: () => ({
      reserveUsage: async input => { hashes.push(input.ipHash); return store.reserveUsage(input); },
      logQuestion: store.logQuestion.bind(store), prune: store.prune.bind(store)
    }),
    runAssistant: async () => { modelCalls++; return { message: 'Projects', sources: [], answered: true }; }
  });
  for (let i = 0; i < 6; i++) {
    const response = await handler(request({ ...payload, sessionId: String(i) }, {
      'x-vercel-forwarded-for': '192.0.2.1', 'x-real-ip': `192.0.2.${i + 2}`, 'x-forwarded-for': `192.0.2.${i + 10}`
    }));
    assert.equal(response.status, i < 5 ? 200 : 429);
  }
  assert.equal(modelCalls, 5);
  assert.equal(new Set(hashes).size, 1);
  assert.equal(hashes[0], usageInput(new Headers({ 'x-forwarded-for': '192.0.2.1' }), 'nimo', 's').ipHash);
});

test('cap and database failure prevent all model calls with friendly contact text', async () => {
  for (const [options, status] of [[{ allowed: false }, 429], [{ dbError: true }, 503]] as const) {
    const h = harness(options);
    const response = await h.handler(request());
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.limited, true);
    assert.match(body.message, /\[the contact section\]\(https:\/\/nimobenne.github.io\/#contact\)/);
    assert.doesNotMatch(body.message, /private/);
    assert.equal(h.modelCalls(), 0);
  }
});

test('kill switch is first and blocks DB and model with no API key configured', async () => {
  for (const value of ['false', '', 'TRUE']) {
    process.env.CHAT_ENABLED = value;
    const h = harness();
    const response = await h.handler(request());
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.limited, true);
    assert.match(body.message, /nimobenne.github.io\/#contact/);
    assert.equal(h.dbCalls(), 0);
    assert.equal(h.modelCalls(), 0);
  }
});

test('body byte limit handles headers, chunked bodies and multibyte text before parsing', async () => {
  for (const req of [request('not json', { 'content-length': '4097' }), request('x'.repeat(4097)), request('é'.repeat(2049))]) {
    const h = harness();
    const response = await h.handler(req);
    assert.equal(response.status, 413);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://nimobenne.github.io');
    assert.equal(h.dbCalls(), 0);
    assert.equal(h.modelCalls(), 0);
  }
  const h = harness();
  assert.equal((await h.handler(request('not json'))).status, 400);
  assert.equal((await h.handler(request({ ...payload, message: 'x'.repeat(501) }))).status, 400);
});

test('chat rejects foreign, missing and malformed origins, forged tokens and unknown sites', async () => {
  const h = harness();
  for (const origin of ['https://evil.com', 'null', 'https://nimobenne.github.io.evil.com', 'https://chat-bot-widget-two.vercel.app']) {
    const response = await h.handler(request(payload, { origin }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  const noOrigin = request();
  noOrigin.headers.delete('origin');
  assert.equal((await h.handler(noOrigin)).status, 403);
  assert.equal((await h.handler(request(payload, { 'x-widget-token': '' }))).status, 401);
  assert.equal((await h.handler(request({ ...payload, siteId: 'missing' }))).status, 404);
  assert.equal(h.dbCalls(), 0);
  assert.equal(domainAllowed('evil.com', ['*']), false);
  assert.equal(domainAllowed('sub.example.com', ['example.com']), false);
});

test('config contract, same-host allowlist, refresh authentication and preflights', async () => {
  const url = 'https://chat-bot-widget-two.vercel.app/api/widget/config?siteId=nimo';
  const headers = { origin: 'https://nimobenne.github.io' };
  const response = await config(new NextRequest(url, { headers }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ['greeting', 'name', 'siteId', 'starters', 'widgetToken']);
  assert.equal(body.starters.length, 3);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await config(new NextRequest(url, { headers: { origin: 'https://chat-bot-widget-two.vercel.app' } }))).status, 403);
  assert.equal((await config(new NextRequest(url.replace('nimo', 'missing'), { headers }))).status, 404);
  const refreshed = await refresh(new NextRequest('https://chat-bot-widget-two.vercel.app/api/widget/token/refresh', {
    method: 'POST', headers: { ...headers, 'x-widget-token': body.widgetToken }, body: JSON.stringify({ siteId: 'nimo' })
  }));
  assert.equal(refreshed.status, 200);
  assert.equal(typeof (await refreshed.json()).widgetToken, 'string');
  assert.equal((await refresh(request({ siteId: 'nimo' }, { 'x-widget-token': 'forged' }))).status, 401);
  for (const options of [configOptions, refreshOptions, widgetOptions]) {
    for (const query of ['', '?siteId=nimo']) {
      const allowed = await options(new NextRequest(`https://chat-bot-widget-two.vercel.app/api/chat${query}`, { method: 'OPTIONS', headers }));
      assert.equal(allowed.status, 204);
      assert.equal(allowed.headers.get('access-control-allow-origin'), headers.origin);
      assert.match(allowed.headers.get('access-control-allow-headers')!, /x-widget-token/);
      assert.equal((await options(new NextRequest(url, { method: 'OPTIONS', headers: { origin: 'https://evil.com' } }))).status, 403);
    }
  }
});

test('missing signing secret fails closed; missing salt and invalid caps stop model calls', async () => {
  delete process.env.WIDGET_SIGNING_SECRET;
  const response = await config(new NextRequest('http://localhost/api/widget/config?siteId=nimo', { headers: { origin: 'http://localhost' } }));
  assert.equal(response.status, 503);
  process.env.WIDGET_SIGNING_SECRET = 'test-signing-secret';
  const h = harness();
  delete process.env.IP_SALT;
  assert.equal((await h.handler(request())).status, 503);
  process.env.IP_SALT = 'test-salt';
  process.env.DAILY_MESSAGE_CAP = '-1';
  assert.equal((await h.handler(request())).status, 503);
  assert.equal(h.modelCalls(), 0);
});

test('cron fails closed without secret and requires bearer auth', async () => {
  delete process.env.CRON_SECRET;
  assert.equal((await prune(new NextRequest('http://localhost/api/cron/prune'))).status, 401);
  process.env.CRON_SECRET = 'test-cron-secret';
  assert.equal((await prune(new NextRequest('http://localhost/api/cron/prune', { headers: { authorization: 'Bearer wrong' } }))).status, 401);
  assert.equal((await prune(new NextRequest('http://localhost/api/cron/prune', { headers: { authorization: 'Bearer test-cron-secret' } }))).status, 200);
});
