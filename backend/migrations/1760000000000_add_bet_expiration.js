/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('bets', {
    expires_at: { type: 'timestamptz' },
  });
  pgm.createIndex('bets', 'expires_at', { name: 'bets_expires_at_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('bets', 'bets_expires_at_idx');
  pgm.dropColumn('bets', 'expires_at');
};
