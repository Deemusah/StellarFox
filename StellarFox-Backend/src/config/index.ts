import fs from 'fs';
import path from 'path';

/**
 * Configuration loader for the StellarFox backend.
 *
 * Non-sensitive configuration is sourced from Kubernetes ConfigMaps and
 * sensitive values from Kubernetes Secrets. Both are mounted as files (or
 * exposed as environment variables) and consumed here so that configuration
 * changes do not require a redeployment.
 *
 * Secret rotation is supported by re-reading the mounted Secret files on
 * demand (see `reload`), so rotated values are picked up without a restart.
 */

export interface AppConfig {
  env: string;
  port: number;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  indexer: {
    pollIntervalMs: number;
    network: string;
    rpcUrl: string;
    rpcSecret: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  features: {
    enableIndexer: boolean;
    enableMetrics: boolean;
  };
}

const CONFIG_DIR = process.env.CONFIG_DIR || '/etc/stellarfox/config';
const SECRETS_DIR = process.env.SECRETS_DIR || '/etc/stellarfox/secrets';

/**
 * Read a value from a mounted file, falling back to an environment variable.
 * Mounted files take precedence so that ConfigMap/Secret updates are honored.
 */
function readValue(fileName: string, envKey: string, fallback?: string): string {
  const filePath = path.join(CONFIG_DIR, fileName);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  } catch {
    // fall through to env / fallback
  }
  const envValue = process.env[envKey];
  if (envValue !== undefined && envValue !== '') {
    return envValue;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required configuration: ${envKey} (${fileName})`);
}

/**
 * Read a sensitive value from a mounted Secret file, falling back to env.
 */
function readSecret(fileName: string, envKey: string, fallback?: string): string {
  const filePath = path.join(SECRETS_DIR, fileName);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8').trim();
    }
  } catch {
    // fall through to env / fallback
  }
  const envValue = process.env[envKey];
  if (envValue !== undefined && envValue !== '') {
    return envValue;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing required secret: ${envKey} (${fileName})`);
}

function toInt(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${value}`);
  }
  return parsed;
}

function toBool(value: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/**
 * Load the full application configuration from ConfigMaps and Secrets.
 */
export function loadConfig(): AppConfig {
  return {
    env: readValue('APP_ENV', 'APP_ENV', 'development'),
    port: toInt(readValue('APP_PORT', 'APP_PORT', '3000'), 'APP_PORT'),
    db: {
      host: readValue('DB_HOST', 'DB_HOST', 'localhost'),
      port: toInt(readValue('DB_PORT', 'DB_PORT', '5432'), 'DB_PORT'),
      name: readValue('DB_NAME', 'DB_NAME', 'stellarfox'),
      user: readValue('DB_USER', 'DB_USER', 'stellarfox'),
      password: readSecret('DB_PASSWORD', 'DB_PASSWORD'),
    },
    indexer: {
      pollIntervalMs: toInt(
        readValue('INDEXER_POLL_INTERVAL_MS', 'INDEXER_POLL_INTERVAL_MS', '5000'),
        'INDEXER_POLL_INTERVAL_MS',
      ),
      network: readValue('STELLAR_NETWORK', 'STELLAR_NETWORK', 'testnet'),
      rpcUrl: readValue('STELLAR_RPC_URL', 'STELLAR_RPC_URL', 'https://soroban-testnet.stellar.org'),
      rpcSecret: readSecret('STELLAR_RPC_SECRET', 'STELLAR_RPC_SECRET', ''),
    },
    jwt: {
      secret: readSecret('JWT_SECRET', 'JWT_SECRET'),
      expiresIn: readValue('JWT_EXPIRES_IN', 'JWT_EXPIRES_IN', '1h'),
    },
    features: {
      enableIndexer: toBool(readValue('FEATURE_ENABLE_INDEXER', 'FEATURE_ENABLE_INDEXER', 'true')),
      enableMetrics: toBool(readValue('FEATURE_ENABLE_METRICS', 'FEATURE_ENABLE_METRICS', 'false')),
    },
  };
}

let cachedConfig: AppConfig | null = null;

/**
 * Return the current configuration, loading it on first access.
 */
export function getConfig(): AppConfig {
  if (cachedConfig === null) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

/**
 * Re-read configuration from the mounted ConfigMap/Secret files. This enables
 * secret rotation and configuration changes without a redeployment.
 */
export function reloadConfig(): AppConfig {
  cachedConfig = loadConfig();
  return cachedConfig;
}

export default getConfig;
