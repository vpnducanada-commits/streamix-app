import crypto from 'node:crypto';
import {query} from '../../_lib/db.js';
import {codeDigest} from '../../_lib/security.js';
import {requireAdmin, setSecurityHeaders, readBody} from '../../_lib/auth.js';

function formatCode(hex) {
  return hex.toUpperCase().match(/.{4}/g).join('-');
}

// Listing never reveals codes: only keyed digests are stored.
async function listCodes(searchParam, status, limit) {
  const search = (searchParam || '').trim().slice(0, 80);
  const rows = await query(
    `SELECT c.id, c.label, c.created_at, c.expires_at, c.max_devices, c.revoked_at,
            count(d.device_digest) FILTER (WHERE d.revoked_at IS NULL)::int AS devices
       FROM streamix.access_codes c
       LEFT JOIN streamix.code_devices d ON d.code_id = c.id
      WHERE ($1 = '' OR c.label ILIKE '%' || $1 || '%' OR c.id::text = $1)
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT $2`,
    [search, limit]
  );
  return rows.filter((row) => {
    const expired = row.expires_at && new Date(row.expires_at) <= new Date();
    if (status === 'active') return !row.revoked_at && !expired;
    if (status === 'expired') return Boolean(expired) && !row.revoked_at;
    if (status === 'revoked') return Boolean(row.revoked_at);
    if (status === 'limit') return row.max_devices !== null && row.devices >= row.max_devices && !row.revoked_at;
    return true;
  });
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const url = new URL(req.url, 'https://streamix.invalid');
    const codes = await listCodes(
      url.searchParams.get('search'),
      url.searchParams.get('status') || 'all',
      Math.min(Number(url.searchParams.get('limit')) || 50, 200)
    );
    return res.status(200).json({
      codes: codes.map((row) => ({
        id: row.id,
        label: row.label,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        maxDevices: row.max_devices,
        revokedAt: row.revoked_at,
        devices: row.devices,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const label = String(body.label || '').trim().slice(0, 80);
    const days = Number(body.expiresInDays);
    const maxDevices = body.maxDevices === null || body.maxDevices === '' ? null : Number(body.maxDevices);
    if (maxDevices !== null && (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10000)) {
      return res.status(400).json({error: 'invalid_max_devices'});
    }
    const expiresAt = Number.isFinite(days) && days > 0
      ? new Date(Date.now() + Math.min(days, 3650) * 86400000).toISOString()
      : null;

    const hex = crypto.randomBytes(16).toString('hex');
    const id = crypto.randomUUID();
    await query(
      `INSERT INTO streamix.access_codes (id, code_digest, label, expires_at, max_devices)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, await codeDigest(hex), label, expiresAt, maxDevices]
    );
    // The plaintext code is returned exactly once and never stored.
    return res.status(201).json({id, code: formatCode(hex), label, expiresAt, maxDevices});
  }

  return res.status(405).json({error: 'method_not_allowed'});
}
