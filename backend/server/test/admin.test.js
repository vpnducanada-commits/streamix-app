const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DATABASE_URL = 'postgresql://user:pass@ep-test-1234.eu-central-1.aws.neon.tech/neondb';
process.env.NEON_AUTH_BASE_URL = 'https://ep-test-1234.neon.tech/neondb/auth';
process.env.STREAMIX_ADMIN_EMAIL = 'vpnducanada@gmail.com';

const calls = [];
let sessionEmail = 'vpnducanada@gmail.com';
let listRows = [];
let created = null;

global.fetch = async (url, options) => {
  const href = String(url);
  if (href.includes('/get-session')) {
    const body = sessionEmail ? {user: {id: 'u1', email: sessionEmail}} : null;
    return {ok: true, status: 200, json: async () => body};
  }
  const body = JSON.parse(options.body);
  calls.push(body.query);
  if (body.query.includes('INSERT INTO streamix.access_codes')) {
    created = body.params;
    return {ok: true, status: 200, text: async () => JSON.stringify([{id: body.params[0]}])};
  }
  if (body.query.includes('FROM streamix.access_codes c')) {
    return {ok: true, status: 200, text: async () => JSON.stringify({rows: listRows})};
  }
  if (body.query.includes('code_hmac_key')) {
    return {ok: true, status: 200, text: async () => JSON.stringify({rows: [{k: 'cd'.repeat(32)}]})};
  }
  return {ok: true, status: 200, text: async () => JSON.stringify({rows: [{ok: 1}]})};
};

const codes = require('../api/admin/codes.js');
const codeById = require('../api/admin/codes/[id].js');

function mockRes() {
  const res = {statusCode: 0, body: null, headers: {}};
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (p) => { res.body = p; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
const admin = {method: 'GET', headers: {cookie: 'session=abc'}, query: {}};
const uuid = '1ce01d6a-86d4-49d1-af13-0549cf243c04';

test('a signed-in non-administrator is refused', async () => {
  sessionEmail = 'inconnu@example.com';
  const res = mockRes();
  await codes(Object.assign({}, admin, {method: 'GET'}), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'not_administrator');
  sessionEmail = 'vpnducanada@gmail.com';
});

test('no session at all is refused', async () => {
  const res = mockRes();
  await codes(Object.assign({}, admin, {headers: {}}), res);
  assert.equal(res.statusCode, 401);
});

test('the administrator lists and filters codes', async () => {
  listRows = [
    {id: uuid, label: 'Client A', created_at: '2026-11-01T10:00:00Z', expires_at: null, max_devices: '2', revoked_at: null, devices: '2'},
    {id: uuid, label: 'Client B', created_at: '2026-11-02T10:00:00Z', expires_at: null, max_devices: '5', revoked_at: '2026-11-03T10:00:00Z', devices: '0'},
  ];
  const res = mockRes();
  await codes(Object.assign({}, admin, {query: {status: 'limit'}}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.codes.length, 1);
  assert.equal(res.body.codes[0].label, 'Client A');
  assert.equal(res.body.codes[0].status, 'active');
});

test('creating a code returns it once and stores only a digest', async () => {
  const res = mockRes();
  await codes(Object.assign({}, admin, {method: 'POST', body: {label: 'Nouveau', expiresInDays: '30', maxDevices: '3'}}), res);
  assert.equal(res.statusCode, 201);
  assert.match(res.body.code, /^[A-F0-9]{4}(-[A-F0-9]{4}){7}$/);
  assert.match(created[1], /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(created).includes(res.body.code.replace(/-/g, '')));
});

test('invalid device count is refused', async () => {
  const res = mockRes();
  await codes(Object.assign({}, admin, {method: 'POST', body: {label: 'x', maxDevices: '0'}}), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, 'invalid_max_devices');
});

test('revoking a code is accepted', async () => {
  const res = mockRes();
  await codeById(Object.assign({}, admin, {method: 'PATCH', body: {revoked: true}, query: {id: uuid}}), res);
  assert.equal(res.statusCode, 200);
});

test('a malformed identifier is rejected', async () => {
  const res = mockRes();
  await codeById(Object.assign({}, admin, {method: 'PATCH', body: {}, query: {id: 'abc'}}), res);
  assert.equal(res.statusCode, 400);
});
