import {
  getMarketCategoryDescendants,
  isMarketCategory,
  MARKET_CATEGORY_HIERARCHY,
} from '../../src/models/MarketCategory';

describe('market category hierarchy', () => {
  it('defines combat sport categories as children of the combat sports category', () => {
    expect(getMarketCategoryDescendants('COMBAT_SPORTS')).toEqual(
      MARKET_CATEGORY_HIERARCHY.COMBAT_SPORTS,
    );
  });

  it('returns only the selected category for a leaf category', () => {
    expect(getMarketCategoryDescendants('BOXING')).toEqual(['BOXING']);
  });

  it('recognizes supported market categories', () => {
    expect(isMarketCategory('MMA')).toBe(true);
    expect(isMarketCategory('COMBAT_SPORTS')).toBe(false);
  });
});
