/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.addColumn('markets', {
    category: { type: 'text', notNull: true, default: 'OTHER' },
  });
  pgm.createIndex('markets', 'category', { name: 'markets_category_idx' });
};

exports.down = (pgm) => {
  pgm.dropIndex('markets', 'category', { name: 'markets_category_idx' });
  pgm.dropColumn('markets', 'category');
};
