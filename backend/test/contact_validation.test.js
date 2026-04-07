const test = require('node:test');
const assert = require('node:assert/strict');

const {
  formatPhoneForStorage,
  normalizePhoneNumber,
  validateContactPayload,
} = require('../src/utils/contact_validation');

test('normalizePhoneNumber strips non-digit characters', () => {
  assert.equal(normalizePhoneNumber('+972 54-710-1657'), '972547101657');
});

test('formatPhoneForStorage standardizes to +digits', () => {
  assert.equal(formatPhoneForStorage('972-54-710-1657'), '+972547101657');
});

test('validateContactPayload normalizes valid input', () => {
  const result = validateContactPayload({
    name: '  Test   Contact  ',
    phone: '+972 54 710 1657',
    circle: 'friends',
    tags: ['family', ' close '],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalizedPhone, '972547101657');
  assert.deepEqual(result.data, {
    name: 'Test Contact',
    phone: '+972547101657',
    circle: 'friends',
    tags: JSON.stringify(['family', 'close']),
  });
});

test('validateContactPayload rejects invalid phone numbers and circles', () => {
  const result = validateContactPayload({
    name: 'Test Contact',
    phone: '123',
    circle: 'invalid',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' | '), /Phone must contain 7-15 digits/);
  assert.match(result.errors.join(' | '), /Circle must be one of/);
});

test('validateContactPayload supports partial updates', () => {
  const result = validateContactPayload(
    {
      phone: '(972) 547-101657',
    },
    { partial: true }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    phone: '+972547101657',
  });
});
