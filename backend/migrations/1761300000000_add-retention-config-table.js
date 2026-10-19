/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('retention_config', {
    id: { type: 'serial', primaryKey: true },
    data_type: { type: 'text', notNull: true, unique: true },
    retention_days: { type: 'integer', notNull: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    description: { type: 'text' },
    updated_by: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('retention_config', 'data_type', {
    unique: true,
    name: 'retention_config_data_type_idx',
  });

  // Seed default retention policies
  pgm.sql(`
    INSERT INTO retention_config (data_type, retention_days, description) VALUES
      ('user_sessions',      30,  'Expired user authentication sessions'),
      ('blockchain_events',  90,  'Processed blockchain events from the indexer'),
      ('notifications',      90,  'Soft-deleted user notification records'),
      ('failed_distributions', 30, 'Failed distribution records awaiting archival'),
      ('bug_reports',       365,  'Closed and resolved bug report submissions'),
      ('feedback',          730,  'User feedback submissions')
    ON CONFLICT (data_type) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('retention_config');
};
