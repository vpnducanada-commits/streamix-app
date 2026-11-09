const {sql} = require('../_lib/db.js');
const {requireAdmin, setSecurityHeaders, readBody} = require('../_lib/http.js');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (!(await requireAdmin(req, res))) return;
  if (req.method !== 'POST') {
    res.status(405).json({error: 'method_not_allowed'});
    return;
  }
  const body = readBody(req);
  const versionCode = Number(body.versionCode);
  const versionName = String(body.versionName || '').trim().slice(0, 24);
  const downloadUrl = String(body.downloadUrl || '').trim();
  const notes = String(body.notes || '').slice(0, 500);

  if (!Number.isInteger(versionCode) || versionCode < 1) {
    res.status(400).json({error: 'invalid_version'});
    return;
  }
  if (!versionName) {
    res.status(400).json({error: 'invalid_name'});
    return;
  }
  if (!/^https:\/\/[^\s]+$/.test(downloadUrl)) {
    res.status(400).json({error: 'invalid_url'});
    return;
  }

  await sql(
    `INSERT INTO streamix.releases (version_code, version_name, download_url, notes)
     VALUES ($1::int, $2::text, $3::text, $4::text)
     ON CONFLICT (version_code) DO UPDATE
       SET version_name = excluded.version_name,
           download_url = excluded.download_url,
           notes = excluded.notes,
           published_at = now()`,
    [versionCode, versionName, downloadUrl, notes]
  );
  res.status(201).json({published: versionCode});
};
