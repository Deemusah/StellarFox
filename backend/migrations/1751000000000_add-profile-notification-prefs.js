/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // user_profiles table
  pgm.createTable('user_profiles', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', notNull: true, unique: true, references: 'users(id)', onDelete: 'cascade' },
    display_name: { type: 'text' },
    bio: { type: 'text' },
    avatar_url: { type: 'text' },
    social_links: { type: 'jsonb', default: pgm.func("'{}'::jsonb") },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('user_profiles', 'user_id', { unique: true, name: 'user_profiles_user_id_idx' });

  // notification_preferences table
  pgm.createTable('notification_preferences', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', notNull: true, unique: true, references: 'users(id)', onDelete: 'cascade' },
    email_notifications: { type: 'boolean', notNull: true, default: true },
    push_notifications: { type: 'boolean', notNull: true, default: true },
    bet_placed: { type: 'boolean', notNull: true, default: true },
    bet_resolved: { type: 'boolean', notNull: true, default: true },
    bet_won: { type: 'boolean', notNull: true, default: true },
    market_locked: { type: 'boolean', notNull: true, default: true },
    achievements: { type: 'boolean', notNull: true, default: true },
    referral_updates: { type: 'boolean', notNull: true, default: true },
    leaderboard_updates: { type: 'boolean', notNull: true, default: false },
    channel: { type: 'text', notNull: true, default: "'email'" },
    quiet_hours_start: { type: 'text' },
    quiet_hours_end: { type: 'text' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('notification_preferences', 'user_id', { unique: true, name: 'notification_preferences_user_id_idx' });

  // Add referral_code and username columns to users table
  pgm.addColumn('users', {
    referral_code: { type: 'text', unique: true },
    username: { type: 'text' },
  });
  pgm.createIndex('users', 'referral_code', { unique: true, name: 'users_referral_code_idx', ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropTable('notification_preferences');
  pgm.dropTable('user_profiles');
  pgm.dropColumn('users', 'referral_code');
  pgm.dropColumn('users', 'username');
};
