const DEFAULT_DEV_JWT_SECRET = 'whatsapp_tracker_super_secret_jwt_key_2024';

function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseTrustProxy(value, isProduction) {
  if (value == null || value === '') {
    return isProduction ? 1 : false;
  }

  if (/^\d+$/.test(String(value).trim())) {
    return Number(value);
  }

  return parseBoolean(value, false) ? true : value;
}

function buildAppConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  const port = Number(env.PORT || 3000);
  const corsOrigins = parseCsv(env.CORS_ORIGINS);
  const trustProxy = parseTrustProxy(env.TRUST_PROXY, isProduction);
  const enableCompression = parseBoolean(env.ENABLE_COMPRESSION, true);

  function validate() {
    if (!jwtSecret) {
      throw new Error('JWT_SECRET is required');
    }

    if (isProduction && jwtSecret === DEFAULT_DEV_JWT_SECRET) {
      throw new Error('Refusing to start in production with the default JWT secret');
    }

    if (isProduction && corsOrigins.length === 0) {
      throw new Error('CORS_ORIGINS must be set in production');
    }
  }

  return {
    nodeEnv,
    isProduction,
    jwtSecret,
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    corsOrigins,
    trustProxy,
    enableCompression,
    validate,
  };
}

const appConfig = buildAppConfig();

function createCorsOptions(config = appConfig) {
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (!config.isProduction) {
        callback(null, true);
        return;
      }

      if (config.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin not allowed by CORS'));
    },
  };
}

module.exports = {
  DEFAULT_DEV_JWT_SECRET,
  appConfig,
  buildAppConfig,
  createCorsOptions,
};
