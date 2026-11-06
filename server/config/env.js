'use strict';

// Load local .env values when dotenv is available. Production environments
// should provide configuration through their environment or secret manager.
try {
  require('dotenv').config();
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

const NODE_ENVS = new Set(['development', 'test', 'production']);

function readString(name, fallback) {
  const value = process.env[name];
  return value == null || value.trim() === '' ? fallback : value.trim();
}

function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;

  switch (raw.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true;
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false;
    default:
      throw new Error(`${name} must be true or false.`);
  }
}

function readInteger(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;

  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name} must be an integer.`);
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }

  return value;
}

function readOrigins() {
  const raw = readString('ALLOWED_ORIGINS', '');
  if (!raw) return [];

  return raw.split(',').map((entry) => {
    const origin = entry.trim();

    if (!origin || origin === '*') {
      throw new Error('ALLOWED_ORIGINS must contain explicit origins, not "*".');
    }

    let url;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid URL: ${origin}`);
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error(`ALLOWED_ORIGINS entries must be plain HTTP(S) origins without paths: ${origin}`);
    }

    return url.origin;
  });
}

function readTrustProxy() {
  const raw = readString('TRUST_PROXY', 'false');
  const lowered = raw.toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(lowered)) return true;
  if (['false', '0', 'no', 'off'].includes(lowered)) return false;

  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (!Number.isSafeInteger(hops) || hops < 0) {
      throw new Error('TRUST_PROXY must be a non-negative hop count, boolean, or proxy list.');
    }
    return hops;
  }

  const proxies = raw.split(',').map((proxy) => proxy.trim()).filter(Boolean);
  if (!proxies.length) {
    throw new Error('TRUST_PROXY must be a boolean, hop count, or proxy list.');
  }

  return proxies;
}

function readBodyLimit() {
  const value = readString('BODY_LIMIT', '1mb');

  // Express/body-parser accepts byte sizes such as "1024", "1mb", and "10kb".
  if (!/^\d+(?:b|kb|mb|gb)?$/i.test(value)) {
    throw new Error('BODY_LIMIT must be a byte size such as "1mb" or "100kb".');
  }

  return value;
}

const nodeEnv = readString('NODE_ENV', 'development').toLowerCase();
if (!NODE_ENVS.has(nodeEnv)) {
  throw new Error(`NODE_ENV must be one of: ${[...NODE_ENVS].join(', ')}.`);
}

const databaseUrl = readString('DATABASE_URL', '');
const databasePort = readInteger('DB_PORT', 5432, 1, 65535);
const database = {
  url: databaseUrl || null,
  host: readString('DB_HOST', ''),
  port: databasePort,
  name: readString('DB_NAME', ''),
  user: readString('DB_USER', ''),
  password: readString('DB_PASSWORD', ''),
  ssl: readBoolean('DB_SSL', false)
};

if (
  nodeEnv === 'production' &&
  !database.url &&
  !(database.host && database.name && database.user && database.password)
) {
  throw new Error(
    'Configure DATABASE_URL or set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD for production.'
  );
}

const config = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: readInteger('PORT', 3000, 1, 65535),
  host: readString('HOST', '0.0.0.0'),
  allowedOrigins: Object.freeze(readOrigins()),
  trustProxy: readTrustProxy(),
  bodyLimit: readBodyLimit(),
  shutdownTimeoutMs: readInteger('SHUTDOWN_TIMEOUT_MS', 10000, 1000, 120000),
  database: Object.freeze(database)
});

module.exports = config;
