/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('users', 'stellar_address', { type: 'text' });
};

exports.down = (pgm) => {
  pgm.dropColumn('users', 'stellar_address');
};