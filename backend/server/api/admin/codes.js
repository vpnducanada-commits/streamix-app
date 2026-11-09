const crypto = require('node:crypto');
const {sql} = require('../_lib/db.js');
const {codeDigest} = require('../_lib/security.js');
const {requireAdmin, setSecurityHeaders, readBody} = require('../_lib/http.js');

const STATUS_ALLOWED = ['all', 'active', 'expired', 'revoked', 'limit'];

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

async function list(search, status, limit) {
  const rows = await sql(
    `SELECT c.id, c.label, c.created_at, c.expires_at, c.max_devices, c.revoked_at,
            (SELECT count(*)::int FROM streamix.code_devices d
              WHERE d.code_id = c.id AND d.revoked_at IS NULL) AS devices
       FROM streamix.access_codes c
      WHERE ($1 = '' OR c.label ILIKE '%' || $1 || '%' OR c.id::text = $1)
      ORDER BY c.created_at DESC
      LIMIT $2`,
    [search, limit]
  );
  const codes = rows.map(shape);
  if (status === 'all') return codes;
  if (status === 'limit') {
    return codes.filter((c) => c.maxDevices !== null && c.devices >= c.maxDevices && !c.revoked);
  }
  return codes.filter((c) => c.status === status);
}

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const search = String(req.query.search || '').trim().slice(0, 80);
    const status = STATUS_ALLOWED.includes(req.query.status) ? req.query.status : 'all';
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const codes = await list(search, status, limit);
    res.status(200).json({codes: codes, total: codes.length});
    return;
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const label = String(body.label || '').trim().slice(0, 80);
    const days = Number(body.expiresInDays);
    let maxDevices = body.maxDevices === null || body.maxDevices === '' || body.maxDevices === undefined
      ? null
      : Number(body.maxDevices);
    if (maxDevices !== null && (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10000)) {
      res.status(400).json({error: 'invalid_max_devices'});
      return;
    }
    const expiresAt = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + Math.min(days, 3650) * 86400000).toISOString()
      : null;

    const hex = crypto.randomBytes(16).toString('hex');
    const id = crypto.randomUUID();
    await sql(
      `INSERT INTO streamix.access_codes (id, code_digest, label, expires_at, max_devices)
       VALUES ($1::uuid, decode($2, 'hex'), $3::text, $4::timestamptz, $5::int)`,
      [id, await codeDigest(hex), label, expiresAt, maxDevices]
    );
    // The readable code is returned once and never stored anywhere.
    res.status(201).json({
      id: id,
      code: hex.toUpperCase().match(/.{4}/g).join('-'),
      label: label,
      expiresAt: expiresAt,
      maxDevices: maxDevices,
    });
    return;
  }

  res.status(405).json({error: 'method_not_allowed'});
};
