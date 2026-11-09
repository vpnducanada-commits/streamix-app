import {query} from './_lib/db.js';
import {setSecurityHeaders} from './_lib/auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'GET') return res.status(405).json({error: 'method_not_allowed'});
  const rows = await query(
    `SELECT version_code, version_name, download_url, notes, published_at
       FROM streamix.releases ORDER BY version_code DESC LIMIT 1`
  );
  if (!rows.length) return res.status(200).json({release: null});
  const row = rows[0];
  return res.status(200).json({
    release: {
      versionCode: row.version_code,
      versionName: row.version_name,
      downloadUrl: row.download_url,
      notes: row.notes,
      publishedAt: row.published_at,
    },
  });
}
