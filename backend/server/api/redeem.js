import {query} from './_lib/db.js';
import {normalizeCode, codeDigest, deviceDigest, ipDigest} from './_lib/security.js';
import {setSecurityHeaders, readBody} from './_lib/auth.js';

export const DESTINATION = 'https://vod.talis.top/';

const MESSAGES = {
  invalid: 'Ce code n’est pas reconnu. Vérifie les caractères et réessaie.',
  expired: 'Ce code a expiré. Contacte l’administrateur pour en obtenir un nouveau.',
  device_limit: 'Ce code a atteint sa limite d’appareils. Demande une réactivation.',
  rate_limited: 'Trop de tentatives. Patiente quelques minutes avant de réessayer.',
};

export default async function handler(req, res) {
  setSecurityHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ok: false, reason: 'method_not_allowed'});

  const body = readBody(req);
  const code = normalizeCode(body.code);
  const device = await deviceDigest(body.deviceId);
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = ipDigest(forwarded || req.socket?.remoteAddress || 'unknown');

  if (!code || !device) {
    return res.status(400).json({ok: false, reason: 'invalid', message: MESSAGES.invalid});
  }

  try {
    const attempts = await query('SELECT streamix.record_attempt($1, $2) AS status', [ip, false]);
    if (attempts[0]?.status === 'rate_limited') {
      return res.status(429).json({ok: false, reason: 'rate_limited', message: MESSAGES.rate_limited});
    }

    const rows = await query('SELECT result, valid_until FROM streamix.claim_device($1, $2)', [
      await codeDigest(code),
      device,
    ]);
    const outcome = rows[0]?.result || 'invalid';

    if (outcome === 'ok') {
      return res.status(200).json({
        ok: true,
        destination: DESTINATION,
        validUntil: rows[0].valid_until,
      });
    }
    const status = outcome === 'expired' ? 410 : outcome === 'device_limit' ? 403 : 404;
    return res.status(status).json({ok: false, reason: outcome, message: MESSAGES[outcome] || MESSAGES.invalid});
  } catch (error) {
    console.error('redeem_failed', error.message);
    return res.status(503).json({ok: false, reason: 'unavailable', message: 'Service momentanément indisponible. Réessaie dans un instant.'});
  }
}
