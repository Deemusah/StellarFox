import migration from '../../migrations/1765000000000_add-market-audit-trail';

describe('market audit trail migration', () => {
  it('audits inserts, updates, and deletes with complete before and after snapshots', () => {
    const pgm = { sql: jest.fn() };

    migration.up(pgm);

    const sql = pgm.sql.mock.calls[0][0] as string;
    expect(sql).toContain('AFTER INSERT OR UPDATE OR DELETE ON markets');
    expect(sql).toContain('before_snapshot');
    expect(sql).toContain('after_snapshot');
    expect(sql).toContain('changed_fields');
    expect(sql).toContain('to_jsonb(OLD)');
    expect(sql).toContain('to_jsonb(NEW)');
  });

  it('records database timestamps and rejects audit record mutation', () => {
    const pgm = { sql: jest.fn() };

    migration.up(pgm);

    const sql = pgm.sql.mock.calls[0][0] as string;
    expect(sql).toContain('clock_timestamp()');
    expect(sql).toContain('ORDER BY key');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON market_audit_log');
    expect(sql).toContain('BEFORE TRUNCATE ON market_audit_log');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE');
  });
});
