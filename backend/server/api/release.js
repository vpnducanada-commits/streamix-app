const {sql} = require('./_lib/db.js');
const {setSecurityHeaders} = require('./_lib/http.js');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'GET') {
    res.status(405).json({error: 'method_not_allowed'});
    return;
  }
  const rows = await sql(
    `SELECT version_code, version_name, download_url, notes, published_at
       FROM streamix.releases ORDER BY version_code DESC LIMIT 1`
  );
  if (!rows.length) {
    res.status(200).json({release: null});
    return;
  }
  const row = rows[0];
  res.status(200).json({
    release: {
      versionCode: Number(row.version_code),
      versionName: row.version_name,
      downloadUrl: row.download_url,
      notes: row.notes,
      publishedAt: row.published_at,
    },
  });
};
