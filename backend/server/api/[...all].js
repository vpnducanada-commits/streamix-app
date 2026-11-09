const crypto = require('node:crypto');
const CONNECTION = process.env.DATABASE_URL || '';
const ADMIN_EMAILS = (process.env.STREAMIX_ADMIN_EMAIL || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
const AUTH_BASE = (process.env.NEON_AUTH_BASE_URL || '').replace(/\/+$/, '');
const DESTINATION = 'https://vod.talis.top/';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESSAGES = {
invalid: 'Ce code n\u2019est pas reconnu. V\u00e9rifie les caract\u00e8res et r\u00e9essaie.',
expired: 'Ce code a expir\u00e9. Contacte l\u2019administrateur pour en obtenir un nouveau.',
device_limit: 'Ce code a atteint sa limite d\u2019appareils. Demande une r\u00e9activation.',
rate_limited: 'Trop de tentatives. Patiente quelques minutes avant de r\u00e9essayer.',
};
async function sql(query, params) {
if (!CONNECTION) throw new Error('DATABASE_URL is not configured');
const host = new URL(CONNECTION).host;
const response = await fetch('https://' + host + '/sql', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Neon-Connection-String': CONNECTION,
'Neon-Raw-Text-Output': 'true',
},
body: JSON.stringify({query: query, params: params || []}),
signal: AbortSignal.timeout(9000),
});
const text = await response.text();
if (!response.ok) throw new Error('database ' + response.status + ': ' + text.slice(0, 120));
if (!text) return [];
const parsed = JSON.parse(text);
if (Array.isArray(parsed)) return parsed;
if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
if (parsed && Array.isArray(parsed.data)) return parsed.data;
return [];
}
let key = null;
async function hmacKey() {
if (key) return key;
const rows = await sql("SELECT encode(value, 'hex') AS k FROM streamix.settings WHERE key = 'code_hmac_key'");
const hex = rows[0] && rows[0].k;
if (!hex || hex.length !== 64) throw new Error('Missing Streamix HMAC key');
key = Buffer.from(hex, 'hex');
return key;
}
function normalizeCode(value) {
if (typeof value !== 'string') return null;
const clean = value.trim().replace(/[\s-]/g, '').toUpperCase();
return /^[A-F0-9]{32}$/.test(clean) ? clean : null;
}
function digest(purpose, value, secret) {
return crypto.createHmac('sha256', secret).update(purpose + '\u0000' + value, 'utf8').digest('hex');
}
async function codeDigest(code) { return digest('code', code, await hmacKey()); }
async function deviceDigest(id) {
if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(id)) return null;
return digest('device', id, await hmacKey());
}
function ipDigest(ip) {
return crypto.createHash('sha256').update('ip\u0000' + (ip || 'unknown'), 'utf8').digest('hex');
}
function head(res) {
res.setHeader('Cache-Control', 'no-store');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Referrer-Policy', 'no-referrer');
}
function body(req) {
if (req.body && typeof req.body === 'object') return req.body;
if (typeof req.body === 'string') {
try { return JSON.parse(req.body); } catch { return {}; }
}
return {};
}
async function isAdmin(req, res) {
if (!AUTH_BASE || !ADMIN_EMAILS.length) { res.status(503).json({error: 'auth_not_configured'}); return false; }
const cookie = req.headers.cookie || '';
if (!cookie) { res.status(401).json({error: 'unauthenticated'}); return false; }
for (const suffix of ['/get-session', '/auth/get-session']) {
let response;
try {
response = await fetch(AUTH_BASE + suffix, {headers: {cookie: cookie, accept: 'application/json'}, signal: AbortSignal.timeout(8000)});
} catch { continue; }
if (!response.ok) continue;
const payload = await response.json().catch(() => null);
const user = (payload && (payload.user || (payload.data && payload.data.user) || (payload.session && payload.session.user))) || null;
if (!user || !user.email) continue;
const found = Buffer.from(String(user.email).trim().toLowerCase());
let allowed = false;
for (const candidate of ADMIN_EMAILS) {
const expected = Buffer.from(candidate);
if (found.length === expected.length && crypto.timingSafeEqual(found, expected)) allowed = true;
}
if (!allowed) {
res.status(403).json({error: 'not_administrator'});
return false;
}
return true;
}
res.status(401).json({error: 'unauthenticated'});
return false;
}
function shape(row) {
const expired = row.expires_at ? new Date(row.expires_at) <= new Date() : false;
return {
id: row.id,
label: row.label,
createdAt: row.created_at,
expiresAt: row.expires_at,
maxDevices: row.max_devices === null ? null : Number(row.max_devices),
revoked: Boolean(row.revoked_at),
expired: expired,
devices: Number(row.devices),
status: row.revoked_at ? 'revoked' : expired ? 'expired' : 'active',
};
}
async function redeem(req, res) {
if (req.method !== 'POST') { res.status(405).json({ok: false, reason: 'method_not_allowed'}); return; }
const payload = body(req);
const code = normalizeCode(payload.code);
let device = null;
try { device = await deviceDigest(payload.deviceId); }
catch (error) { res.status(503).json({ok: false, reason: 'unavailable', message: 'Service momentan\u00e9ment indisponible.'}); return; }
const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
const ip = ipDigest(forwarded || (req.socket && req.socket.remoteAddress) || 'unknown');
if (!code || !device) { res.status(400).json({ok: false, reason: 'invalid', message: MESSAGES.invalid}); return; }
try {
const attempts = await sql("SELECT streamix.record_attempt(decode($1, 'hex'), $2) AS status", [ip, false]);
if (attempts[0] && attempts[0].status === 'rate_limited') {
res.status(429).json({ok: false, reason: 'rate_limited', message: MESSAGES.rate_limited});
return;
}
const rows = await sql("SELECT result, valid_until FROM streamix.claim_device(decode($1, 'hex'), decode($2, 'hex'))",
[await codeDigest(code), device]);
const outcome = (rows[0] && rows[0].result) || 'invalid';
if (outcome === 'ok') {
res.status(200).json({ok: true, destination: DESTINATION, validUntil: rows[0].valid_until});
return;
}
const status = outcome === 'expired' ? 410 : outcome === 'device_limit' ? 403 : 404;
res.status(status).json({ok: false, reason: outcome, message: MESSAGES[outcome] || MESSAGES.invalid});
} catch (error) {
console.error('redeem_failed', error.message);
res.status(503).json({ok: false, reason: 'unavailable', message: 'Service momentan\u00e9ment indisponible. R\u00e9essaie dans un instant.'});
}
}
async function listCodes(req, res) {
const url = new URL(req.url, 'https://streamix.invalid');
const search = String(url.searchParams.get('search') || '').trim().slice(0, 80);
const status = ['all', 'active', 'expired', 'revoked', 'limit'].includes(url.searchParams.get('status'))
? url.searchParams.get('status') : 'all';
const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);
const rows = await sql(
"SELECT c.id, c.label, c.created_at, c.expires_at, c.max_devices, c.revoked_at, " +
"(SELECT count(*)::int FROM streamix.code_devices d WHERE d.code_id = c.id AND d.revoked_at IS NULL) AS devices " +
"FROM streamix.access_codes c WHERE ($1 = '' OR c.label ILIKE '%' || $1 || '%' OR c.id::text = $1) " +
"ORDER BY c.created_at DESC LIMIT $2",
[search, limit]
);
let codes = rows.map(shape);
if (status === 'limit') codes = codes.filter((c) => c.maxDevices !== null && c.devices >= c.maxDevices && !c.revoked);
else if (status !== 'all') codes = codes.filter((c) => c.status === status);
res.status(200).json({codes: codes, total: codes.length});
}
async function createCode(req, res) {
const payload = body(req);
const label = String(payload.label || '').trim().slice(0, 80);
const days = Number(payload.expiresInDays);
const rawMax = payload.maxDevices;
const maxDevices = rawMax === null || rawMax === '' || rawMax === undefined ? null : Number(rawMax);
if (maxDevices !== null && (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10000)) {
res.status(400).json({error: 'invalid_max_devices'});
return;
}
const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86400000).toISOString() : null;
const hex = crypto.randomBytes(16).toString('hex');
const id = crypto.randomUUID();
await sql('INSERT INTO streamix.access_codes (id, code_digest, label, expires_at, max_devices) ' +
"VALUES ($1::uuid, decode($2, 'hex'), $3::text, $4::timestamptz, $5::int)",
[id, await codeDigest(hex), label, expiresAt, maxDevices]);
res.status(201).json({id: id, code: hex.toUpperCase().match(/.{4}/g).join('-'), label: label, expiresAt: expiresAt, maxDevices: maxDevices});
}
async function codeItem(req, res, id) {
if (!UUID_RE.test(id)) { res.status(400).json({error: 'invalid_id'}); return; }
const url = new URL(req.url, 'https://streamix.invalid');
if (req.method === 'GET') {
const rows = await sql("SELECT encode(device_digest, 'hex') AS key, first_seen, last_seen, revoked_at FROM streamix.code_devices WHERE code_id = $1::uuid ORDER BY last_seen DESC", [id]);
res.status(200).json({devices: rows.map((row, index) => ({
slot: index + 1,
key: String(row.key).slice(0, 12),
firstSeen: row.first_seen,
lastSeen: row.last_seen,
revoked: Boolean(row.revoked_at),
}))});
return;
}
if (req.method === 'PATCH') {
const revoke = body(req).revoked !== false;
const rows = await sql('UPDATE streamix.access_codes SET revoked_at = $2::timestamptz WHERE id = $1::uuid RETURNING id, revoked_at',
[id, revoke ? new Date().toISOString() : null]);
if (!rows.length) { res.status(404).json({error: 'not_found'}); return; }
res.status(200).json({id: rows[0].id, revokedAt: rows[0].revoked_at});
return;
}
if (req.method === 'DELETE') {
const deviceKey = String(url.searchParams.get('device') || '').toLowerCase();
if (!/^[0-9a-f]{8,64}$/.test(deviceKey)) { res.status(400).json({error: 'invalid_device'}); return; }
const rows = await sql('UPDATE streamix.code_devices SET revoked_at = now() WHERE code_id = $1::uuid ' +
"AND encode(device_digest, 'hex') LIKE $2 || '%' AND revoked_at IS NULL RETURNING device_digest", [id, deviceKey]);
res.status(200).json({freed: rows.length});
return;
}
res.status(405).json({error: 'method_not_allowed'});
}
async function latestRelease(req, res) {
if (req.method !== 'GET') { res.status(405).json({error: 'method_not_allowed'}); return; }
const rows = await sql('SELECT version_code, version_name, download_url, notes, published_at FROM streamix.releases ORDER BY version_code DESC LIMIT 1');
if (!rows.length) { res.status(200).json({release: null}); return; }
const row = rows[0];
res.status(200).json({release: {
versionCode: Number(row.version_code),
versionName: row.version_name,
downloadUrl: row.download_url,
notes: row.notes,
publishedAt: row.published_at,
}});
}
async function publishRelease(req, res) {
if (req.method !== 'POST') { res.status(405).json({error: 'method_not_allowed'}); return; }
const payload = body(req);
const versionCode = Number(payload.versionCode);
const versionName = String(payload.versionName || '').trim().slice(0, 24);
const downloadUrl = String(payload.downloadUrl || '').trim();
const notes = String(payload.notes || '').slice(0, 500);
if (!Number.isInteger(versionCode) || versionCode < 1) { res.status(400).json({error: 'invalid_version'}); return; }
if (!versionName) { res.status(400).json({error: 'invalid_name'}); return; }
if (!/^https:\/\/[^\s]+$/.test(downloadUrl)) { res.status(400).json({error: 'invalid_url'}); return; }
await sql('INSERT INTO streamix.releases (version_code, version_name, download_url, notes) ' +
'VALUES ($1::int, $2::text, $3::text, $4::text) ON CONFLICT (version_code) DO UPDATE ' +
'SET version_name = excluded.version_name, download_url = excluded.download_url, notes = excluded.notes, published_at = now()',
[versionCode, versionName, downloadUrl, notes]);
res.status(201).json({published: versionCode});
}
function relayCookie(cookie) {
const parts = cookie.split(';');
const pair = parts.shift();
let maxAge = '';
for (const part of parts) {
const t = part.trim();
if (/^max-age=/i.test(t)) maxAge = '; ' + t;
}
return pair + '; Path=/' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}
async function authProxy(req, res, rest) {
if (!AUTH_BASE) { res.status(503).json({error: 'auth_not_configured'}); return; }
let authOrigin = '';
try { authOrigin = new URL(AUTH_BASE).origin; } catch { authOrigin = ''; }
const headers = {'content-type': req.headers['content-type'] || 'application/json', accept: 'application/json'};
if (req.headers.cookie) headers.cookie = req.headers.cookie;
if (authOrigin) {
headers.origin = authOrigin;
headers.referer = authOrigin + '/';
}
const init = {method: req.method, headers: headers, signal: AbortSignal.timeout(10000)};
if (req.method !== 'GET' && req.method !== 'HEAD') {
init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
}
try {
const upstream = await fetch(AUTH_BASE + '/' + rest, init);
const text = await upstream.text();
const cookies = upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [];
if (cookies.length) res.setHeader('Set-Cookie', cookies.map(relayCookie));
res.status(upstream.status);
res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
res.send(text);
} catch (error) {
console.error('auth_proxy_failed', error.message);
res.status(503).json({error: 'auth_unreachable'});
}
}
module.exports = async function handler(req, res) {
  head(res);
  const url = new URL(req.url, 'https://streamix.invalid');
  const path = url.pathname.replace(/^\/api/, '') || '/';
  try {
    if (path === '/health') {
      const tables = await sql("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'streamix'");
      const k = await sql("SELECT length(value)::int AS n FROM streamix.settings WHERE key = 'code_hmac_key'");
      res.status(200).json({ok: true, database: 'reachable', streamixTables: tables[0] ? tables[0].n : 0, hmacKeyBytes: k[0] ? k[0].n : 0});
      return;
    }
    if (path === '/redeem') { await redeem(req, res); return; }
    if (path === '/release') { await latestRelease(req, res); return; }
    if (path === '/session') { await authProxy(req, res, 'get-session'); return; }
    if (path === '/signin') { await authProxy(req, res, 'sign-in/email'); return; }
    if (path === '/signup') { await authProxy(req, res, 'sign-up/email'); return; }
    if (path === '/signout') { await authProxy(req, res, 'sign-out'); return; }
    if (path === '/codes') {
      if (!(await isAdmin(req, res))) return;
      const id = url.searchParams.get('id');
      if (id) { await codeItem(req, res, id); return; }
      if (req.method === 'GET') { await listCodes(req, res); return; }
      if (req.method === 'POST') { await createCode(req, res); return; }
      res.status(405).json({error: 'method_not_allowed'});
      return;
    }
    if (path === '/publish') {
      if (!(await isAdmin(req, res))) return;
      await publishRelease(req, res);
      return;
    }
    res.status(404).json({error: 'not_found'});
  } catch (error) {
    console.error('api_failed', path, error.message);
    res.status(503).json({error: 'unavailable'});
  }
};
