export const MARKET_CATEGORIES = ['BOXING', 'MMA', 'KICKBOXING', 'OTHER'] as const;
export const MARKET_CATEGORY_FILTERS = [...MARKET_CATEGORIES, 'COMBAT_SPORTS'] as const;

export const MARKET_CATEGORY_HIERARCHY = {
  COMBAT_SPORTS: MARKET_CATEGORIES,
} as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];
export type MarketCategoryFilter = MarketCategory | keyof typeof MARKET_CATEGORY_HIERARCHY;

export function isMarketCategory(value: unknown): value is MarketCategory {
  return typeof value === 'string' && MARKET_CATEGORIES.includes(value as MarketCategory);
}

export function getMarketCategoryDescendants(category: MarketCategoryFilter): readonly MarketCategory[] {
  if (category === 'COMBAT_SPORTS') {
    return MARKET_CATEGORY_HIERARCHY.COMBAT_SPORTS;
  }
  return [category];
}
