/* eslint-disable camelcase */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX markets_category_idx ON markets (LOWER(weight_class));
    CREATE INDEX markets_search_idx
      ON markets USING GIN (
        to_tsvector('simple', concat_ws(' ', fighter_a, fighter_b, weight_class, venue))
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS markets_search_idx');
  pgm.sql('DROP INDEX IF EXISTS markets_category_idx');
};
