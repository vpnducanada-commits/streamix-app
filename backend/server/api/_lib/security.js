import crypto from 'node:crypto';
import {hmacKey} from './db.js';

const CODE_RE = /^[A-F0-9]{32}$/;
const DEVICE_RE = /^[A-Za-z0-9_-]{32,128}$/;

export function normalizeCode(value) {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/[\s-]/g, '').toUpperCase();
  return CODE_RE.test(clean) ? clean : null;
}

function digest(purpose, value, key) {
  return crypto.createHmac('sha256', key).update(purpose + '\0' + value, 'utf8').digest();
}

export async function codeDigest(code) {
  return digest('code', code, await hmacKey());
}

export async function deviceDigest(deviceId) {
  if (typeof deviceId !== 'string' || !DEVICE_RE.test(deviceId)) return null;
  return digest('device', deviceId, await hmacKey());
}

export function ipDigest(ip) {
  return crypto.createHash('sha256').update('ip\0' + (ip || 'unknown'), 'utf8').digest();
}
