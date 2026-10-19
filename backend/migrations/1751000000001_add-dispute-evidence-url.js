/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('disputes', 'evidence_url', { type: 'text' });
};

exports.down = (pgm) => {
  pgm.dropColumn('disputes', 'evidence_url');
};