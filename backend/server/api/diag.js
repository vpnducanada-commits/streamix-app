const {sql} = require('./_lib/db.js');

// Temporary diagnostics: identifies what the deployed server sees.
async function rawProbe() {
  const url = process.env.DATABASE_URL || '';
  const response = await fetch('https://' + new URL(url).host + '/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': url,
      'Neon-Raw-Text-Output': 'true',
    },
    body: JSON.stringify({query: 'SELECT 1 AS ping', params: []}),
    signal: AbortSignal.timeout(9000),
  });
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return 'array(' + parsed.length + ')';
    return 'object:' + Object.keys(parsed).join(',');
  } catch {
    return 'unparsed:' + text.slice(0, 60);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const raw = await rawProbe();
    const db = await sql('SELECT current_database() AS db, current_user AS usr');
    const schemas = await sql('SELECT schema_name FROM information_schema.schemata ORDER BY schema_name');
    const tables = await sql(
      "SELECT table_schema, count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') GROUP BY table_schema ORDER BY table_schema"
    );
    res.status(200).json({
      rawShape: raw,
      database: db[0] ? db[0].db : null,
      user: db[0] ? db[0].usr : null,
      schemas: schemas.map((r) => r.schema_name),
      tablesBySchema: tables,
    });
  } catch (error) {
    res.status(503).json({error: String(error.message).slice(0, 200)});
  }
};
