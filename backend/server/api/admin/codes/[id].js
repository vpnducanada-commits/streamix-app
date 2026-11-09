import {query} from '../../_lib/db.js';
import {requireAdmin, setSecurityHeaders, readBody} from '../../_lib/auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;

  const id = String(req.query.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({error: 'invalid_id'});
  const url = new URL(req.url, 'https://streamix.invalid');

  if (req.method === 'GET') {
    const rows = await query(
      `SELECT d.device_digest, d.first_seen, d.last_seen, d.revoked_at
         FROM streamix.code_devices d WHERE d.code_id = $1 ORDER BY d.last_seen DESC`,
      [id]
    );
    return res.status(200).json({
      devices: rows.map((row, index) => ({
        slot: index + 1,
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        revoked: Boolean(row.revoked_at),
        key: row.device_digest.toString('hex').slice(0, 12),
      })),
    });
  }

  if (req.method === 'PATCH') {
    const body = readBody(req);
    const revoke = body.revoked !== false;
    const rows = await query(
      `UPDATE streamix.access_codes SET revoked_at = $2 WHERE id = $1
       RETURNING id, revoked_at`,
      [id, revoke ? new Date().toISOString() : null]
    );
    if (!rows.length) return res.status(404).json({error: 'not_found'});
    return res.status(200).json({id: rows[0].id, revokedAt: rows[0].revoked_at});
  }

  // Frees one device slot: the device must sign in again on next use.
  if (req.method === 'DELETE') {
    const key = String(url.searchParams.get('device') || '');
    if (!/^[0-9a-f]{24}$/i.test(key)) return res.status(400).json({error: 'invalid_device'});
    const rows = await query(
      `UPDATE streamix.code_devices SET revoked_at = now()
        WHERE code_id = $1 AND encode(device_digest, 'hex') LIKE $2 || '%' AND revoked_at IS NULL
        RETURNING device_digest`,
      [id, key.toLowerCase()]
    );
    return res.status(200).json({freed: rows.length});
  }

  return res.status(405).json({error: 'method_not_allowed'});
}
