import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { signWidgetToken, verifyWidgetToken } from '../lib/widgetToken';

test('tokens are mandatory, signed, site/host bound, and expiring', () => {
  process.env.WIDGET_SIGNING_SECRET = 'test-secret';
  const expected = { siteId: 'nimo', host: 'localhost' };
  const token = signWidgetToken(expected);
  assert.equal(verifyWidgetToken(token, expected).ok, true);
  assert.equal(verifyWidgetToken(null, expected).ok, false);
  assert.equal(verifyWidgetToken(`${token}.extra`, expected).ok, false);
  assert.equal(verifyWidgetToken(`${token}tampered`, expected).ok, false);
  assert.equal(verifyWidgetToken(token, { ...expected, siteId: 'widgetai' }).ok, false);
  assert.equal(verifyWidgetToken(token, { ...expected, host: 'evil.com' }).ok, false);
  const expired = signWidgetToken({ ...expected, ttlSeconds: -60 });
  assert.equal(verifyWidgetToken(expired, expected).ok, false);
  assert.equal(verifyWidgetToken(expired, expected, { graceSeconds: 300 }).ok, true);
  const malformed = Buffer.from(JSON.stringify({ ...expected, exp: 'never' })).toString('base64url');
  const sig = createHmac('sha256', 'test-secret').update(malformed).digest('base64url');
  assert.equal(verifyWidgetToken(`${malformed}.${sig}`, expected).ok, false);
  delete process.env.WIDGET_SIGNING_SECRET;
  assert.equal(verifyWidgetToken(token, expected).ok, false);
  assert.throws(() => signWidgetToken(expected));
});
