'use strict';
const crypto = require('node:crypto');

// Generated codes contain 128 bits of entropy; only a keyed digest is stored.
function generateCode() {
  return crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
}
function normalizeCode(code) {
  if (typeof code !== 'string') throw new TypeError('Invalid code');
  const normalized = code.trim().replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(normalized)) throw new TypeError('Invalid code');
  return normalized;
}
function hmacDigest(secret, purpose, value) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('Server secret is not configured');
  return crypto.createHmac('sha256', secret).update(purpose + '\0' + value, 'utf8').digest();
}
function digestCode(secret, code) {
  return hmacDigest(secret, 'code', normalizeCode(code));
}
function digestDevice(secret, id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(id)) throw new TypeError('Invalid device identifier');
  return hmacDigest(secret, 'device', id);
}
module.exports = { generateCode, normalizeCode, digestCode, digestDevice };
