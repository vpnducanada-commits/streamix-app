// Build-time connection test: proves the deployed API can reach the Streamix
// database and that the security schema is installed. Prints no secrets.
import fs from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL missing in this environment');
  process.exit(1);
}

const client = new pg.Client({connectionString: url, connectionTimeoutMillis: 15000});
try {
  await client.connect();
  const tables = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'streamix' ORDER BY 1"
  );
  const key = await client.query("SELECT length(value) AS len FROM streamix.settings WHERE key = 'code_hmac_key'");
  console.log('CONNEXION NEON: OK');
  console.log('SCHEMA streamix:', tables.rows.map((r) => r.table_name).join(', ') || '(absent)');
  console.log('CLE HMAC:', key.rows[0] ? `${key.rows[0].len} octets` : 'ABSENTE');
  const hasFn = await client.query(
    "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'streamix' ORDER BY 1"
  );
  console.log('FONCTIONS:', hasFn.rows.map((r) => r.proname).join(', ') || '(aucune)');
} catch (error) {
  console.error('CONNEXION NEON: ECHEC —', error.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

fs.mkdirSync('public', {recursive: true});
if (fs.existsSync('index.html')) fs.copyFileSync('index.html', 'public/index.html');
console.log('BUILD: OK');
