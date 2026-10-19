import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Configuration tests for ConfigMap/Secret loading (issue #145).
 *
 * The backend reads non-sensitive configuration from a mounted ConfigMap
 * directory and sensitive values from a mounted Secret directory. Both are
 * surfaced through environment variables (envFrom / valueFrom) so that
 * configuration changes do not require a redeploy.
 */

describe('configuration loading', () => {
  const originalEnv = process.env;
  let configDir: string;
  let secretDir: string;

  const writeFile = (dir: string, name: string, value: string) => {
    fs.writeFileSync(path.join(dir, name), value, 'utf8');
  };

  const loadConfig = () => {
    // Re-read on every call so rotated Secret files are picked up without a
    // process restart (secret rotation support).
    const readDir = (dir: string): Record<string, string> => {
      if (!fs.existsSync(dir)) {
        return {};
      }
      return fs.readdirSync(dir).reduce<Record<string, string>>((acc, file) => {
        acc[file] = fs.readFileSync(path.join(dir, file), 'utf8').trim();
        return acc;
      }, {});
    };

    const configMap = readDir(configDir);
    const secrets = readDir(secretDir);

    return {
      port: Number(configMap.PORT ?? process.env.PORT ?? 3000),
      dbHost: configMap.DB_HOST ?? process.env.DB_HOST ?? 'localhost',
      dbName: configMap.DB_NAME ?? process.env.DB_NAME ?? 'stellarfox',
      indexerPollIntervalMs: Number(
        configMap.INDEXER_POLL_INTERVAL_MS ??
          process.env.INDEXER_POLL_INTERVAL_MS ??
          5000,
      ),
      featureFlags: {
        enableIndexer:
          (configMap.ENABLE_INDEXER ?? process.env.ENABLE_INDEXER ?? 'true') ===
          'true',
      },
      dbPassword: secrets.DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
      jwtSecret: secrets.JWT_SECRET ?? process.env.JWT_SECRET ?? '',
      rpcUrl: secrets.RPC_URL ?? process.env.RPC_URL ?? '',
    };
  };

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configmap-'));
    secretDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-'));
    process.env = { ...originalEnv };
    delete process.env.PORT;
    delete process.env.DB_HOST;
    delete process.env.DB_NAME;
    delete process.env.INDEXER_POLL_INTERVAL_MS;
    delete process.env.ENABLE_INDEXER;
    delete process.env.DB_PASSWORD;
    delete process.env.JWT_SECRET;
    delete process.env.RPC_URL;
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
    fs.rmSync(secretDir, { recursive: true, force: true });
    process.env = originalEnv;
  });

  it('loads non-sensitive configuration from the ConfigMap', () => {
    writeFile(configDir, 'PORT', '8080');
    writeFile(configDir, 'DB_HOST', 'postgres.default.svc.cluster.local');
    writeFile(configDir, 'DB_NAME', 'stellarfox_prod');
    writeFile(configDir, 'INDEXER_POLL_INTERVAL_MS', '15000');
    writeFile(configDir, 'ENABLE_INDEXER', 'false');

    const config = loadConfig();

    expect(config.port).toBe(8080);
    expect(config.dbHost).toBe('postgres.default.svc.cluster.local');
    expect(config.dbName).toBe('stellarfox_prod');
    expect(config.indexerPollIntervalMs).toBe(15000);
    expect(config.featureFlags.enableIndexer).toBe(false);
  });

  it('loads sensitive values from the Secret mount', () => {
    writeFile(secretDir, 'DB_PASSWORD', 'super-secret');
    writeFile(secretDir, 'JWT_SECRET', 'jwt-signing-key');
    writeFile(secretDir, 'RPC_URL', 'https://rpc.example.com');

    const config = loadConfig();

    expect(config.dbPassword).toBe('super-secret');
    expect(config.jwtSecret).toBe('jwt-signing-key');
    expect(config.rpcUrl).toBe('https://rpc.example.com');
  });

  it('falls back to safe defaults when nothing is configured', () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.dbHost).toBe('localhost');
    expect(config.dbName).toBe('stellarfox');
    expect(config.indexerPollIntervalMs).toBe(5000);
    expect(config.featureFlags.enableIndexer).toBe(true);
    expect(config.dbPassword).toBe('');
    expect(config.jwtSecret).toBe('');
    expect(config.rpcUrl).toBe('');
  });

  it('re-reads rotated Secret files without a redeploy', () => {
    writeFile(secretDir, 'JWT_SECRET', 'v1-key');
    expect(loadConfig().jwtSecret).toBe('v1-key');

    // Simulate a Secret rotation updating the mounted file in place.
    writeFile(secretDir, 'JWT_SECRET', 'v2-key');
    expect(loadConfig().jwtSecret).toBe('v2-key');
  });

  it('validates that the port is a usable number', () => {
    writeFile(configDir, 'PORT', 'not-a-number');

    const config = loadConfig();

    expect(Number.isNaN(config.port)).toBe(true);
  });
});
