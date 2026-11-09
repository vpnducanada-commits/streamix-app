const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://u:p@ep-test-1234.eu-central-1.aws.neon.tech/neondb';
process.env.STREAMIX_ADMIN_EMAIL = 'vpnducanada@gmail.com';
process.env.NEON_AUTH_BASE_URL = 'https://ep-test-1234.neon.tech/neondb/auth';

let sessionUser = {id: 'u1', email: 'vpnducanada@gmail.com'};
let claimResult = 'ok';
let attemptStatus = 'recorded';
let codeRows = [];
let lastInsert = null;
const seen = [];

global.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('/get-session')) {
    return {ok: true, status: 200, json: async () => (sessionUser ? {user: sessionUser} : null)};
  }
  if (href.includes('/sign-in/email')) return {ok: true, status: 200, text: async () => '{"ok":true}', headers: {getSetCookie: () => [], get: () => 'application/json'}};
  const q = JSON.parse(options.body).query;
  seen.push(q);
  if (q.includes("encode(value, 'hex')")) return {ok: true, status: 200, text: async () => JSON.stringify([{k: 'ef'.repeat(32)}])};
  if (q.includes('record_attempt')) return {ok: true, status: 200, text: async () => JSON.stringify([{status: attemptStatus}])};
  if (q.includes('claim_device')) { seen.push(JSON.stringify(JSON.parse(options.body).params)); return {ok: true, status: 200, text: async () => JSON.stringify([{result: claimResult, valid_until: '2026-12-01T00:00:00Z'}])}; }
  if (q.includes('INSERT INTO streamix.access_codes')) { lastInsert = JSON.parse(options.body).params; return {ok: true, status: 200, text: async () => '[]'}; }
  if (q.includes('FROM streamix.access_codes c')) return {ok: true, status: 200, text: async () => JSON.stringify({rows: codeRows})};
  if (q.includes('information_schema.tables')) return {ok: true, status: 200, text: async () => JSON.stringify([{n: 5}])};
  if (q.includes('streamix.settings')) return {ok: true, status: 200, text: async () => JSON.stringify([{n: 32}])};
  return {ok: true, status: 200, text: async () => '[]'};
};

const api = require('../api/[...all].js');
const device = 'A'.repeat(43);
const code = 'A1B2-C3D4-E5F6-0718-293A-4B5C-6D7E-8F90';

function res() {
  const r = {code: 0, payload: null, headers: {}};
  r.status = (c) => { r.code = c; return r; };
  r.json = (p) => { r.payload = p; return r; };
  r.send = (t) => { r.payload = t; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  return r;
}
function req(path, opts) {
  opts = opts || {};
  return {url: '/api' + path, method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body, query: {}, socket: {remoteAddress: '1.2.3.4'}};
}

test('health reports the real schema', async () => {
  const r = res();
  await api(req('/health'), r);
  assert.equal(r.code, 200);
  assert.equal(r.payload.streamixTables, 5);
  assert.equal(r.payload.hmacKeyBytes, 32);
});

test('redeem accepts a valid code and pins the destination', async () => {
  claimResult = 'ok';
  const r = res();
  await api(req('/redeem', {method: 'POST', body: {code: code, deviceId: device}}), r);
  assert.equal(r.code, 200);
  assert.equal(r.payload.destination, 'https://vod.talis.top/');
  assert.ok(!JSON.stringify(seen).includes('A1B2C3D4'));
});

test('redeem refuses a third device', async () => {
  claimResult = 'device_limit';
  const r = res();
  await api(req('/redeem', {method: 'POST', body: {code: code, deviceId: device}}), r);
  assert.equal(r.code, 403);
  assert.equal(r.payload.reason, 'device_limit');
});

test('redeem refuses an expired code', async () => {
  claimResult = 'expired';
  const r = res();
  await api(req('/redeem', {method: 'POST', body: {code: code, deviceId: device}}), r);
  assert.equal(r.code, 410);
});

test('redeem throttles after too many attempts', async () => {
  attemptStatus = 'rate_limited';
  const r = res();
  await api(req('/redeem', {method: 'POST', body: {code: code, deviceId: device}}), r);
  assert.equal(r.code, 429);
  attemptStatus = 'recorded';
});

test('admin routes require a session', async () => {
  const r = res();
  await api(req('/codes'), r);
  assert.equal(r.code, 401);
});

test('a signed-in stranger is refused', async () => {
  sessionUser = {id: 'u2', email: 'autre@example.com'};
  const r = res();
  await api(req('/codes', {headers: {cookie: 's=1'}}), r);
  assert.equal(r.code, 403);
  sessionUser = {id: 'u1', email: 'vpnducanada@gmail.com'};
});

test('the administrator can list codes', async () => {
  codeRows = [{id: '1ce01d6a-86d4-49d1-af13-0549cf243c04', label: 'Client A', created_at: '2026-11-01T10:00:00Z', expires_at: null, max_devices: '2', revoked_at: null, devices: '1'}];
  const r = res();
  await api(req('/codes', {headers: {cookie: 's=1'}}), r);
  assert.equal(r.code, 200);
  assert.equal(r.payload.codes[0].label, 'Client A');
  assert.equal(r.payload.codes[0].status, 'active');
});

test('the administrator can create a code, stored only as a digest', async () => {
  const r = res();
  await api(req('/codes', {method: 'POST', headers: {cookie: 's=1'}, body: {label: 'Neuf', maxDevices: '3', expiresInDays: '30'}}), r);
  assert.equal(r.code, 201);
  assert.match(r.payload.code, /^[A-F0-9]{4}(-[A-F0-9]{4}){7}$/);
  assert.match(lastInsert[1], /^[0-9a-f]{64}$/);
});

test('an invalid device count is refused', async () => {
  const r = res();
  await api(req('/codes', {method: 'POST', headers: {cookie: 's=1'}, body: {label: 'x', maxDevices: '0'}}), r);
  assert.equal(r.code, 400);
});

test('unknown routes answer 404', async () => {
  const r = res();
  await api(req('/inconnu'), r);
  assert.equal(r.code, 404);
});

test('le code est empreinté en minuscules, comme à la création', async () => {
  const crypto = require('node:crypto');
  const key = Buffer.from('ef'.repeat(32), 'hex');
  const lower = 'A1B2C3D4E5F60718293A4B5C6D7E8F90'.toLowerCase();
  const attendu = crypto.createHmac('sha256', key).update('code\u0000' + lower, 'utf8').digest('hex');
  seen.length = 0;
  claimResult = 'ok';
  const r = res();
  await api(req('/redeem', {method: 'POST', body: {code: code, deviceId: device}}), r);
  const params = JSON.parse(seen[seen.length - 1]);
  assert.equal(params[0], attendu);
});
