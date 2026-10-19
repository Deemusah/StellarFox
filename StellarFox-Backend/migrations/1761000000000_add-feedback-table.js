/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('user_feedback', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', references: 'users(id)', onDelete: 'SET NULL' },
    category: { type: 'text', notNull: true }, // 'general' | 'feature_request' | 'ux' | 'performance' | 'other'
    rating: { type: 'integer' }, // 1-5
    message: { type: 'text', notNull: true },
    page_url: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('user_feedback', 'user_id', { name: 'user_feedback_user_id_idx' });
  pgm.createIndex('user_feedback', 'category', { name: 'user_feedback_category_idx' });
  pgm.createIndex('user_feedback', 'created_at', { name: 'user_feedback_created_at_idx' });
};

exports.down = (pgm) => {
  pgm.dropTable('user_feedback');
};
