const {sql} = require('./_lib/db.js');
const {normalizeCode, codeDigest, deviceDigest, ipDigest} = require('./_lib/security.js');
const {setSecurityHeaders, readBody} = require('./_lib/http.js');

const DESTINATION = 'https://vod.talis.top/';

const MESSAGES = {
  invalid: 'Ce code n\u2019est pas reconnu. V\u00e9rifie les caract\u00e8res et r\u00e9essaie.',
  expired: 'Ce code a expir\u00e9. Contacte l\u2019administrateur pour en obtenir un nouveau.',
  device_limit: 'Ce code a atteint sa limite d\u2019appareils. Demande une r\u00e9activation.',
  rate_limited: 'Trop de tentatives. Patiente quelques minutes avant de r\u00e9essayer.',
};

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') {
    res.status(405).json({ok: false, reason: 'method_not_allowed'});
    return;
  }

  const body = readBody(req);
  const code = normalizeCode(body.code);
  let device = null;
  try {
    device = await deviceDigest(body.deviceId);
  } catch (error) {
    console.error('key_unavailable', error.message);
    res.status(503).json({ok: false, reason: 'unavailable', message: 'Service momentan\u00e9ment indisponible.'});
    return;
  }
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = ipDigest(forwarded || (req.socket && req.socket.remoteAddress) || 'unknown');

  if (!code || !device) {
    res.status(400).json({ok: false, reason: 'invalid', message: MESSAGES.invalid});
    return;
  }

  try {
    const attempts = await sql('SELECT streamix.record_attempt(decode($1, \'hex\'), $2) AS status', [ip, false]);
    if (attempts[0] && attempts[0].status === 'rate_limited') {
      res.status(429).json({ok: false, reason: 'rate_limited', message: MESSAGES.rate_limited});
      return;
    }

    const codeHex = await codeDigest(code);
    const rows = await sql(
      "SELECT result, valid_until FROM streamix.claim_device(decode($1, 'hex'), decode($2, 'hex'))",
      [codeHex, device]
    );
    const outcome = (rows[0] && rows[0].result) || 'invalid';

    if (outcome === 'ok') {
      res.status(200).json({ok: true, destination: DESTINATION, validUntil: rows[0].valid_until});
      return;
    }
    const status = outcome === 'expired' ? 410 : outcome === 'device_limit' ? 403 : 404;
    res.status(status).json({ok: false, reason: outcome, message: MESSAGES[outcome] || MESSAGES.invalid});
  } catch (error) {
    console.error('redeem_failed', error.message);
    res.status(503).json({ok: false, reason: 'unavailable', message: 'Service momentan\u00e9ment indisponible. R\u00e9essaie dans un instant.'});
  }
};
