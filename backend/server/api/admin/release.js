import {query} from '../_lib/db.js';
import {requireAdmin, setSecurityHeaders, readBody} from '../_lib/auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== 'POST') return res.status(405).json({error: 'method_not_allowed'});

  const body = readBody(req);
  const versionCode = Number(body.versionCode);
  const versionName = String(body.versionName || '').trim().slice(0, 24);
  const downloadUrl = String(body.downloadUrl || '').trim();
  const notes = String(body.notes || '').slice(0, 500);

  if (!Number.isInteger(versionCode) || versionCode < 1) return res.status(400).json({error: 'invalid_version'});
  if (!versionName) return res.status(400).json({error: 'invalid_name'});
  if (!/^https:\/\/[^\s]+$/.test(downloadUrl)) return res.status(400).json({error: 'invalid_url'});

  await query(
    `INSERT INTO streamix.releases (version_code, version_name, download_url, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (version_code) DO UPDATE
       SET version_name = excluded.version_name,
           download_url = excluded.download_url,
           notes = excluded.notes,
           published_at = now()`,
    [versionCode, versionName, downloadUrl, notes]
  );
  return res.status(201).json({published: versionCode});
}
