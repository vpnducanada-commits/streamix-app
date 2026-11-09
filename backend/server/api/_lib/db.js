// Streamix data access without third-party dependencies.
// Queries go through Neon's HTTPS SQL endpoint, so the deployed function needs
// neither node_modules nor a package.json (only the server-side DATABASE_URL).
const CONNECTION = process.env.DATABASE_URL || '';

function sqlEndpoint() {
  const parsed = new URL(CONNECTION);
  return 'https://' + parsed.host + '/sql';
}

async function sql(query, params) {
  if (!CONNECTION) throw new Error('DATABASE_URL is not configured');
  const response = await fetch(sqlEndpoint(), {
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
  if (!response.ok) {
    throw new Error('database ' + response.status + ': ' + text.slice(0, 120));
  }
  if (!text) return [];
  const parsed = JSON.parse(text);
  // Neon returns either a plain array of rows or an envelope with a rows field.
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  if (parsed && Array.isArray(parsed.data)) return parsed.data;
  return [];
}

let cachedKey = null;
async function hmacKey() {
  if (cachedKey) return cachedKey;
  const rows = await sql("SELECT encode(value, 'hex') AS k FROM streamix.settings WHERE key = 'code_hmac_key'");
  const hex = rows[0] && rows[0].k;
  if (!hex || hex.length !== 64) throw new Error('Missing Streamix HMAC key');
  cachedKey = Buffer.from(hex, 'hex');
  return cachedKey;
}

module.exports = {sql, hmacKey};
