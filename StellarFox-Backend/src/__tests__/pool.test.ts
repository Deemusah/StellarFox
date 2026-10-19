import { Pool, PoolConfig } from '../db/pool';

describe('Database Connection Pool', () => {
  let pool: Pool;

  beforeEach(() => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'test_db',
      user: 'test_user',
      password: 'test_password',
      max: 5,
      min: 1,
      idleTimeoutMillis: 1000,
      connectionTimeoutMillis: 500,
    });
  });

  afterEach(async () => {
    await pool.end();
  });

  it('should create a pool with configured size', () => {
    expect(pool.options.max).toBe(5);
    expect(pool.options.min).toBe(1);
  });

  it('should reuse connections from the pool', async () => {
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    expect(client1).toBeDefined();
    expect(client2).toBeDefined();

    client1.release();
    client2.release();

    const client3 = await pool.connect();
    expect(client3).toBeDefined();
    client3.release();
  });

  it('should expose pool metrics', () => {
    const metrics = pool.getMetrics();

    expect(metrics).toHaveProperty('totalCount');
    expect(metrics).toHaveProperty('idleCount');
    expect(metrics).toHaveProperty('waitingCount');
    expect(typeof metrics.totalCount).toBe('number');
    expect(typeof metrics.idleCount).toBe('number');
    expect(typeof metrics.waitingCount).toBe('number');
  });

  it('should respect max pool size', async () => {
    const clients = [];
    for (let i = 0; i < 5; i++) {
      clients.push(await pool.connect());
    }

    expect(pool.getMetrics().totalCount).toBeLessThanOrEqual(5);

    clients.forEach((client) => client.release());
  });

  it('should handle connection timeout', async () => {
    const clients = [];
    for (let i = 0; i < 5; i++) {
      clients.push(await pool.connect());
    }

    await expect(pool.connect()).rejects.toThrow(/timeout/i);

    clients.forEach((client) => client.release());
  });
});
