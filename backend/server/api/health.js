import {query} from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error: 'method_not_allowed'});
  try {
    const rows = await query(
      "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'streamix'"
    );
    return res.status(200).json({ok: true, database: 'reachable', streamixTables: rows[0].tables});
  } catch (error) {
    console.error('health_failed', error.message);
    return res.status(503).json({ok: false, database: 'unreachable'});
  }
}
