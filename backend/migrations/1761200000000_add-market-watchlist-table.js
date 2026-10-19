/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('market_watchlist', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'text', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    market_id: { type: 'uuid', notNull: true, references: 'markets(id)', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });
  pgm.createIndex('market_watchlist', ['user_id', 'market_id'], {
    unique: true,
    name: 'market_watchlist_user_market_idx',
  });
  pgm.createIndex('market_watchlist', 'user_id', { name: 'market_watchlist_user_id_idx' });
};

exports.down = (pgm) => {
  pgm.dropTable('market_watchlist');
};
