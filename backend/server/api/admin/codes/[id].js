const {sql} = require('../../_lib/db.js');
const {requireAdmin, setSecurityHeaders, readBody} = require('../../_lib/http.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;

  const id = String(req.query.id || '');
  if (!UUID_RE.test(id)) {
    res.status(400).json({error: 'invalid_id'});
    return;
  }

  if (req.method === 'GET') {
    const rows = await sql(
      `SELECT encode(device_digest, 'hex') AS key, first_seen, last_seen, revoked_at
         FROM streamix.code_devices WHERE code_id = $1::uuid
        ORDER BY last_seen DESC`,
      [id]
    );
    res.status(200).json({
      devices: rows.map((row, index) => ({
        slot: index + 1,
        key: String(row.key).slice(0, 12),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        revoked: Boolean(row.revoked_at),
      })),
    });
    return;
  }

  // Activate or deactivate a code. Deactivation applies immediately on the server.
  if (req.method === 'PATCH') {
    const body = readBody(req);
    const revoke = body.revoked !== false;
    const rows = await sql(
      `UPDATE streamix.access_codes SET revoked_at = $2::timestamptz
        WHERE id = $1::uuid RETURNING id, revoked_at`,
      [id, revoke ? new Date().toISOString() : null]
    );
    if (!rows.length) {
      res.status(404).json({error: 'not_found'});
      return;
    }
    res.status(200).json({id: rows[0].id, revokedAt: rows[0].revoked_at});
    return;
  }

  // Frees one device slot; that device must sign in again with the code.
  if (req.method === 'DELETE') {
    const key = String(req.query.device || '').toLowerCase();
    if (!/^[0-9a-f]{8,64}$/.test(key)) {
      res.status(400).json({error: 'invalid_device'});
      return;
    }
    const rows = await sql(
      `UPDATE streamix.code_devices SET revoked_at = now()
        WHERE code_id = $1::uuid AND encode(device_digest, 'hex') LIKE $2 || '%'
          AND revoked_at IS NULL
        RETURNING device_digest`,
      [id, key]
    );
    res.status(200).json({freed: rows.length});
    return;
  }

  res.status(405).json({error: 'method_not_allowed'});
};
