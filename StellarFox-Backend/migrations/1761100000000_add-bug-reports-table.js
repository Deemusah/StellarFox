/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('bug_reports', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', references: 'users(id)', onDelete: 'SET NULL' },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, default: "'medium'" }, // 'low' | 'medium' | 'high' | 'critical'
    category: { type: 'text', notNull: true, default: "'general'" }, // 'ui' | 'transaction' | 'wallet' | 'market' | 'general'
    steps_to_reproduce: { type: 'text' },
    expected_behavior: { type: 'text' },
    actual_behavior: { type: 'text' },
    page_url: { type: 'text' },
    browser_info: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    status: { type: 'text', notNull: true, default: "'open'" }, // 'open' | 'investigating' | 'resolved' | 'closed'
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('bug_reports', 'user_id', { name: 'bug_reports_user_id_idx' });
  pgm.createIndex('bug_reports', 'severity', { name: 'bug_reports_severity_idx' });
  pgm.createIndex('bug_reports', 'status', { name: 'bug_reports_status_idx' });
  pgm.createIndex('bug_reports', 'created_at', { name: 'bug_reports_created_at_idx' });
};

exports.down = (pgm) => {
  pgm.dropTable('bug_reports');
};
