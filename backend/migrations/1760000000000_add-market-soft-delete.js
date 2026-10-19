/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('markets', {
    deleted_at: { type: 'timestamptz' },
    deleted_by: { type: 'text' },
  });
  pgm.createIndex('markets', 'deleted_at');
};

exports.down = (pgm) => {
  pgm.dropIndex('markets', 'deleted_at');
  pgm.dropColumns('markets', ['deleted_at', 'deleted_by']);
};