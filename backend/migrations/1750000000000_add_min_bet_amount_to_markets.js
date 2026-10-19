/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('markets', {
    min_bet_amount: {
      type: 'numeric',
      notNull: true,
      default: 1000000,
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumn('markets', 'min_bet_amount');
};
