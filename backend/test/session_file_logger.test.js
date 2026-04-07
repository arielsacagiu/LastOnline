const test = require('node:test');
const assert = require('node:assert/strict');

const SessionFileLogger = require('../src/services/session_file_logger');

test('formatSessionLine renders human-readable timestamps and duration', () => {
  const logger = new SessionFileLogger();
  const line = logger.formatSessionLine({
    startedAt: new Date('2026-04-07T14:12:00.000Z'),
    endedAt: new Date('2026-04-07T14:14:05.000Z'),
    durationSec: 125,
  });

  assert.match(line, /logged on from 17:12:00-17:14:05/);
  assert.match(line, /2 minutes 5 seconds/);
});

test('formatDuration handles ongoing and zero-second sessions', () => {
  const logger = new SessionFileLogger();

  assert.equal(logger.formatDuration(null), 'ongoing');
  assert.equal(logger.formatDuration(0), '0 seconds');
  assert.equal(logger.formatDuration(3661), '1 hour 1 minute 1 second');
});
