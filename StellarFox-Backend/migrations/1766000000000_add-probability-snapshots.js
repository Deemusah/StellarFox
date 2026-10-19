/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('probability_snapshots', {
    id: { type: 'bigserial', primaryKey: true },
    market_id: { type: 'text', notNull: true },
    sampled_at: { type: 'timestamptz', notNull: true, default: pgm.func('clock_timestamp()') },
    source: { type: 'text', notNull: true },
    probability_a: { type: 'numeric(12,10)', notNull: true },
    probability_b: { type: 'numeric(12,10)', notNull: true },
    probability_draw: { type: 'numeric(12,10)', notNull: true },
    pool_a: { type: 'numeric', notNull: true },
    pool_b: { type: 'numeric', notNull: true },
    pool_draw: { type: 'numeric', notNull: true },
    total_pool: { type: 'numeric', notNull: true },
  });
  pgm.addConstraint('probability_snapshots', 'probability_snapshots_source_check', {
    check: "source IN ('interval', 'event')",
  });
  pgm.addConstraint('probability_snapshots', 'probability_snapshots_probability_check', {
    check: 'probability_a BETWEEN 0 AND 1 AND probability_b BETWEEN 0 AND 1 AND probability_draw BETWEEN 0 AND 1',
  });
  pgm.addConstraint('probability_snapshots', 'probability_snapshots_market_sample_unique', {
    unique: ['market_id', 'sampled_at', 'source'],
  });
  pgm.createIndex('probability_snapshots', ['market_id', 'sampled_at']);
};

exports.down = (pgm) => {
  pgm.dropTable('probability_snapshots');
};
