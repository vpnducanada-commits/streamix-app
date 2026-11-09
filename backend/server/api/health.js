const {sql} = require('./_lib/db.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({error: 'method_not_allowed'});
    return;
  }
  try {
    const tables = await sql("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'streamix'");
    const key = await sql("SELECT length(value)::int AS n FROM streamix.settings WHERE key = 'code_hmac_key'");
    res.status(200).json({
      ok: true,
      database: 'reachable',
      streamixTables: tables[0] ? tables[0].n : 0,
      hmacKeyBytes: key[0] ? key[0].n : 0,
    });
  } catch (error) {
    console.error('health_failed', error.message);
    res.status(503).json({ok: false, database: 'unreachable', detail: String(error.message).slice(0, 140)});
  }
};
