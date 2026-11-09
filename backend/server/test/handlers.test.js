const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://user:pass@ep-test-1234.eu-central-1.aws.neon.tech/neondb';
process.env.STREAMIX_ADMIN_EMAIL = 'vpnducanada@gmail.com';

let claimResult = 'ok';
let attemptStatus = 'recorded';
const seenQueries = [];

global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  seenQueries.push({url: String(url), query: body.query, params: body.params});
  if (body.query.includes('code_hmac_key')) {
    return {ok: true, status: 200, text: async () => JSON.stringify([{k: 'ab'.repeat(32)}])};
  }
  if (body.query.includes('record_attempt')) {
    return {ok: true, status: 200, text: async () => JSON.stringify([{status: attemptStatus}])};
  }
  if (body.query.includes('claim_device')) {
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{result: claimResult, valid_until: '2026-12-01T00:00:00Z'}]),
    };
  }
  return {ok: true, status: 200, text: async () => JSON.stringify([{n: 3}])};
};

const {default: redeem} = (() => ({default: require('../api/redeem.js')}))();
const health = require('../api/health.js');

function mockRes() {
  const res = {statusCode: 0, body: null, headers: {}};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}

const deviceId = 'A'.repeat(43);
const validCode = 'ABCD-EF01-2345-6789-ABCD-EF01-2345-6789';

test('health reports the database is reachable', async () => {
  const res = mockRes();
  await health({method: 'GET', headers: {}}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.database, 'reachable');
});

test('a valid code is accepted and always points to the official destination', async () => {
  claimResult = 'ok';
  const res = mockRes();
  await redeem({method: 'POST', headers: {'x-forwarded-for': '41.1.2.3'}, body: {code: validCode, deviceId}}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.destination, 'https://vod.talis.top/');
  assert.equal(res.body.validUntil, '2026-12-01T00:00:00Z');
  // Digests must be sent as hex, never plaintext codes.
  const claim = seenQueries.find((q) => q.query.includes('claim_device'));
  assert.match(claim.params[0], /^[0-9a-f]{64}$/);
  assert.match(claim.params[1], /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(seenQueries).includes('ABCDEF01'));
});

test('a code at its device limit is refused with a clear message', async () => {
  claimResult = 'device_limit';
  const res = mockRes();
  await redeem({method: 'POST', headers: {}, body: {code: validCode, deviceId}}, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.reason, 'device_limit');
  assert.match(res.body.message, /limite d.appareils/);
});

test('an expired code is refused', async () => {
  claimResult = 'expired';
  const res = mockRes();
  await redeem({method: 'POST', headers: {}, body: {code: validCode, deviceId}}, res);
  assert.equal(res.statusCode, 410);
  assert.equal(res.body.reason, 'expired');
});

test('an unknown code is refused without touching the database claim', async () => {
  claimResult = 'invalid';
  const res = mockRes();
  await redeem({method: 'POST', headers: {}, body: {code: validCode, deviceId}}, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.reason, 'invalid');
});

test('malformed input is rejected before any lookup', async () => {
  const before = seenQueries.length;
  const res = mockRes();
  await redeem({method: 'POST', headers: {}, body: {code: 'pas-un-code', deviceId}}, res);
  assert.equal(res.statusCode, 400);
  assert.equal(seenQueries.length, before);
});

test('too many attempts are throttled', async () => {
  attemptStatus = 'rate_limited';
  const res = mockRes();
  await redeem({method: 'POST', headers: {}, body: {code: validCode, deviceId}}, res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.reason, 'rate_limited');
  attemptStatus = 'recorded';
});
