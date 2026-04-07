const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DEV_JWT_SECRET,
  buildAppConfig,
  createCorsOptions,
} = require('../src/config');

function evaluateCors(corsOptions, origin) {
  return new Promise((resolve, reject) => {
    corsOptions.origin(origin, (err, allowed) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(allowed);
    });
  });
}

test('production config rejects default JWT secret', () => {
  const config = buildAppConfig({
    NODE_ENV: 'production',
    JWT_SECRET: DEFAULT_DEV_JWT_SECRET,
    CORS_ORIGINS: 'https://app.example.com',
  });

  assert.throws(() => config.validate(), /default JWT secret/);
});

test('production config requires CORS_ORIGINS', () => {
  const config = buildAppConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'super-secret-production-value',
  });

  assert.throws(() => config.validate(), /CORS_ORIGINS must be set/);
});

test('development config allows any browser origin', async () => {
  const config = buildAppConfig({
    NODE_ENV: 'development',
    JWT_SECRET: 'dev-secret',
  });
  const corsOptions = createCorsOptions(config);

  assert.equal(await evaluateCors(corsOptions, 'https://random.example.com'), true);
});

test('production config restricts browser origins', async () => {
  const config = buildAppConfig({
    NODE_ENV: 'production',
    JWT_SECRET: 'super-secret-production-value',
    CORS_ORIGINS: 'https://app.example.com,https://admin.example.com',
  });
  const corsOptions = createCorsOptions(config);

  await assert.doesNotReject(() =>
    evaluateCors(corsOptions, 'https://app.example.com')
  );
  await assert.rejects(
    () => evaluateCors(corsOptions, 'https://blocked.example.com'),
    /Origin not allowed by CORS/
  );
});
