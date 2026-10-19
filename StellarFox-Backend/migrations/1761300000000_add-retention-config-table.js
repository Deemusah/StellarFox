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
  // Insert defaults
  pgm.sql(`
    INSERT INTO retention_config (data_type, retention_days, description) VALUES
    ('user_sessions', 30, 'Expired user sessions'),
    ('blockchain_events', 90, 'Processed blockchain events'),
    ('notifications', 90, 'Old soft-deleted notifications'),
    ('bug_reports', 365, 'Closed bug reports'),
    ('feedback', 730, 'User feedback submissions')
    ON CONFLICT DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('retention_config');
};
