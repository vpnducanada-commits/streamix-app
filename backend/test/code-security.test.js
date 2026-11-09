'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {generateCode, normalizeCode, digestCode, digestDevice} = require('../code-security');
const secret = 'A-secure-testing-secret-at-least-32-bytes';
test('codes have 128 bits of random data and are normalized consistently', () => {
  const code = generateCode();
  assert.match(code, /^[A-F0-9]{4}(?:-[A-F0-9]{4}){7}$/);
  assert.equal(normalizeCode(code), normalizeCode(code.toLowerCase().replaceAll('-', ' ')));
  assert.deepEqual(digestCode(secret, code), digestCode(secret, code.toLowerCase()));
});
test('reject malformed codes and weak server secrets', () => {
  assert.throws(() => digestCode(secret, 'STREAMIX'));
  assert.throws(() => digestCode('short', generateCode()));
  assert.throws(() => digestDevice(secret, 'short'));
});
test('separate code and device domains', () => {
  const s = 'A'.repeat(32);
  assert.notDeepEqual(digestCode(secret, s), digestDevice(secret, s));
});
