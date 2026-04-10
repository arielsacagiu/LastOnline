const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectStateFromText,
  extractPairingCodeFromText,
} = require('../setup_phone_code');

test('extractPairingCodeFromText returns contiguous 8-digit codes', () => {
  assert.equal(
    extractPairingCodeFromText('Enter the 8-digit code shown here: 12345678'),
    '12345678'
  );
});

test('extractPairingCodeFromText joins spaced and multiline digits', () => {
  assert.equal(
    extractPairingCodeFromText('Enter this code on your phone:\n1 2 3 4\n5 6 7 8'),
    '12345678'
  );
});

test('extractPairingCodeFromText ignores longer numbers', () => {
  assert.equal(
    extractPairingCodeFromText('Not a pairing code: 123456789'),
    null
  );
});

test('detectStateFromText identifies phone-code and login states', () => {
  assert.equal(
    detectStateFromText('Enter the 8-digit code on your phone: 1234 5678'),
    'phone_code'
  );
  assert.equal(
    detectStateFromText('Scan to log in or log in with phone number'),
    'login_required'
  );
});
