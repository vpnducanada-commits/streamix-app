const crypto = require('node:crypto');
const {hmacKey} = require('./db.js');

const CODE_RE = /^[A-F0-9]{32}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{32,128}$/;

function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(clean) ? clean : null;
}

function digest(purpose, value, key) {
  return crypto.createHmac('sha256', key).update(purpose + '\u0000' + value, 'utf8').digest('hex');
}

async function codeDigest(code) {
  return digest('code', code, await hmacKey());
}

async function deviceDigest(deviceId) {
  if (typeof deviceId !== 'string' || !DEVICE_RE.test(deviceId)) return null;
  return digest('device', deviceId, await hmacKey());
}

function ipDigest(ip) {
  return crypto.createHash('sha256').update('ip\u0000' + (ip || 'unknown'), 'utf8').digest('hex');
}

module.exports = {normalizeCode, codeDigest, deviceDigest, ipDigest};
