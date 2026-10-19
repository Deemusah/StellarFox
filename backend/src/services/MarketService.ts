// ============================================================
// BANKERCHANGER — Market Service
// Business logic layer between controllers and the DB/chain.
// Contributors: implement every function marked TODO.
// ============================================================

import type { Market, MarketStats, PlatformStats, ProbabilitySnapshot } from '../models/Market';
import type { Market, MarketStats, PlatformStats } from '../models/Market';
import { getMarketCategoryDescendants, type MarketCategoryFilter } from '../models/MarketCategory';
import type { Bet } from '../models/Bet';
import { pool } from '../config/db';
import * as cache from './cache.service';
import * as StellarService from './StellarService';
import { AppError } from '../utils/AppError';

function buildMarketWhere(filters?: MarketFilters): { whereSql: string; values: unknown[] } {
  const whereClauses: string[] = [];
  const values: unknown[] = [];

  if (filters?.status) {
    values.push(filters.status);
    whereClauses.push(`status = $${values.length}`);
  }
  const category = filters?.category ?? filters?.weight_class;
  if (category) {
    values.push(category);
    whereClauses.push(`LOWER(weight_class) = LOWER($${values.length})`);
  }
  if (filters?.search?.trim()) {
    values.push(filters.search.trim());
    whereClauses.push(
      `to_tsvector('simple', concat_ws(' ', fighter_a, fighter_b, weight_class, venue)) ` +
      `@@ plainto_tsquery('simple', $${values.length})`,
    );
  }
  if (filters?.fighter) {
    values.push(`%${filters.fighter}%`);
    whereClauses.push(`(fighter_a ILIKE $${values.length} OR fighter_b ILIKE $${values.length})`);
  }
  if (filters?.dateFrom) {
    values.push(filters.dateFrom);
    whereClauses.push(`scheduled_at >= $${values.length}`);
  }
  if (filters?.dateTo) {
    values.push(filters.dateTo);
    whereClauses.push(`scheduled_at <= $${values.length}`);
  }

  return {
    whereSql: whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '',
    values,
  };
}

// ---------------------------------------------------------------------------
// DB adapter — thin abstraction so tests can inject a mock
// ---------------------------------------------------------------------------
// Valid state transitions for market status.
// Enforced in updateMarketStatus to prevent invalid transitions.
const VALID_TRANSITIONS: Record<string, string[]> = {
  open:      ['locked', 'cancelled', 'disputed'],
  locked:    ['resolved', 'cancelled', 'disputed'],
  resolved:  ['disputed'],
  disputed:  ['resolved'],
  cancelled: [],
};

/**
 * Validates a market status transition against the state machine.
 * Throws AppError if the transition is not allowed.
 */
export function validateStatusTransition(currentStatus: string, newStatus: string): void {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    throw new AppError(400, `Unknown market status: ${currentStatus}`);
  }
  if (!allowed.includes(newStatus)) {
    throw new AppError(
      400,
      `Invalid status transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ') || 'none'}`,
    );
  }
}

export interface DbAdapter {
  findMarkets(filters?: MarketFilters): Promise<Market[]>;
  findMarketById(market_id: string): Promise<Market | null>;
  findBetsByAddress(bettor_address: string): Promise<Bet[]>;
  findBetsByMarket(market_id: string, bettor_address?: string): Promise<Bet[]>;
  updateMarketStatus(market_id: string, status: string): Promise<void>;
  softDeleteMarket?(market_id: string, deleted_by: string): Promise<boolean>;
}

export const defaultDbAdapter: DbAdapter = {
  async findMarkets(filters?: MarketFilters): Promise<Market[]> {
    const { whereSql, values } = buildMarketWhere(filters);
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      values.push(filters.status);
      whereClauses.push(`status = $${values.length}`);
    }
    if (filters?.weight_class) {
      values.push(filters.weight_class);
      whereClauses.push(`weight_class = $${values.length}`);
    }
    if (filters?.category) {
      values.push(getMarketCategoryDescendants(filters.category));
      whereClauses.push(`category = ANY($${values.length}::text[])`);
    }
    if (filters?.fighter) {
      values.push(`%${filters.fighter}%`);
      whereClauses.push(`(fighter_a ILIKE $${values.length} OR fighter_b ILIKE $${values.length})`);
    }
    if (filters?.dateFrom) {
      values.push(filters.dateFrom);
      whereClauses.push(`scheduled_at >= $${values.length}`);
    }
    if (filters?.dateTo) {
      values.push(filters.dateTo);
      whereClauses.push(`scheduled_at <= $${values.length}`);
    }

    whereClauses.unshift('deleted_at IS NULL');
    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderBySql =
      filters?.sort === 'date_asc' ? 'ORDER BY scheduled_at ASC' :
      filters?.sort === 'pool_desc' ? 'ORDER BY total_pool DESC' :
      'ORDER BY scheduled_at DESC';

    const { rows } = await pool.query(
      `SELECT * FROM markets ${whereSql} ${orderBySql}`,
      values,
    );

    return rows.map((row) => ({
      ...row,
      scheduled_at: new Date(row.scheduled_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
    } as Market));
  },

  async findMarketById(market_id: string): Promise<Market | null> {
    const { rows } = await pool.query(
      'SELECT * FROM markets WHERE market_id = $1 AND deleted_at IS NULL',
      [market_id],
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
      ...row,
      scheduled_at: new Date(row.scheduled_at),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
    } as Market;
  },

  async findBetsByAddress(bettor_address: string): Promise<Bet[]> {
    const { rows } = await pool.query(
      'SELECT * FROM bets WHERE bettor_address = $1 ORDER BY placed_at DESC',
      [bettor_address],
    );
    return rows.map((row) => ({
      ...row,
      placed_at: new Date(row.placed_at),
      claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
    } as Bet));
  },

  async findBetsByMarket(market_id: string, bettor_address?: string): Promise<Bet[]> {
    const values: unknown[] = [market_id];
    let sql = `SELECT b.* FROM bets b
               JOIN markets m ON m.market_id = b.market_id
               WHERE b.market_id = $1 AND m.deleted_at IS NULL`;

    if (bettor_address) {
      values.push(bettor_address);
      sql += ` AND b.bettor_address = $${values.length}`;
    }

    sql += ' ORDER BY b.placed_at DESC';

    const { rows } = await pool.query(sql, values);
    return rows.map((row) => ({
      ...row,
      placed_at: new Date(row.placed_at),
      claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
    } as Bet));
  },

  async updateMarketStatus(market_id: string, status: string): Promise<void> {
    await pool.query(
      'UPDATE markets SET status = $1, updated_at = NOW() WHERE market_id = $2',
      [status, market_id],
    );
  },

  async softDeleteMarket(market_id: string, deleted_by: string): Promise<boolean> {
    const result = await pool.query(
      'UPDATE markets SET deleted_at = NOW(), deleted_by = $2, updated_at = NOW() WHERE market_id = $1 AND deleted_at IS NULL',
      [market_id, deleted_by],
    );
    return (result.rowCount ?? 0) > 0;
  },
};

let _db: DbAdapter | null = null;

export function setDbAdapter(adapter: DbAdapter): void {
  _db = adapter;
}

function db(): DbAdapter {
  if (!_db) throw new Error('DbAdapter not initialised');
  return _db;
}

export { db };

/**
 * Updates a market's status after validating the state transition.
 * Reads the current status from the DB, validates, then applies the update.
 */
export async function updateMarketStatus(market_id: string, newStatus: string): Promise<void> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);
  validateStatusTransition(market.status, newStatus);
  await db().updateMarketStatus(market_id, newStatus);
  await invalidateMarketCache(market_id);
}

export async function softDeleteMarket(market_id: string, deleted_by = 'system'): Promise<void> {
  const adapter = db();
  if (!adapter.softDeleteMarket) throw new AppError(501, 'Market deletion is not supported');
  const deleted = await adapter.softDeleteMarket(market_id, deleted_by);
  if (!deleted) throw AppError.notFound(`Market not found: ${market_id}`);
  await invalidateMarketCache(market_id);
  await cache.del('platform:stats');
}

export interface MarketFilters {
  status?: string;
  category?: string;
  category?: MarketCategoryFilter;
  weight_class?: string;
  search?: string;
  fighter?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: 'date_asc' | 'date_desc' | 'pool_desc';
}

export interface Pagination {
  page: number;
  limit: number;
}

export interface MarketListResult {
  markets: Market[];
  total: number;
}

export interface MarketOdds {
  odds_a: number;   // Implied probability in basis points
  odds_b: number;
  odds_draw: number;
}

export interface MarketWithOdds extends Market {
  odds: MarketOdds;
}

export interface OutcomeOdds {
  outcome: string;
  multiplier: number;
  implied_probability: number;
  pool: string;
  total_pool: string;
}

export interface AllOutcomeOdds {
  market_id: string;
  fighter_a: OutcomeOdds;
  fighter_b: OutcomeOdds;
  draw: OutcomeOdds;
  total_pool: string;
}

export interface Portfolio {
  address: string;
  active_bets: Bet[];
  past_bets: Bet[];
  total_staked_xlm: number;
  total_won_xlm: number;
  total_lost_xlm: number;
  pending_claims: Bet[];
}

export interface BettorStats {
  bettor_address: string;
  total_bets: number;
  total_wagered_xlm: number;
  total_winnings_xlm: number;
  win_rate: number;
  favorite_fighter: string | null;
}

export interface ProjectedPayout {
  amount: string;
  formatted_xlm: number;
}

export interface ProbabilityHistoryFilters {
  from?: Date;
  to?: Date;
  limit: number;
}

function mapProbabilitySnapshot(row: Record<string, unknown>): ProbabilitySnapshot {
  return {
    market_id: String(row.market_id),
    sampled_at: new Date(row.sampled_at as string | number | Date),
    source: row.source as ProbabilitySnapshot['source'],
    probability_a: Number(row.probability_a),
    probability_b: Number(row.probability_b),
    probability_draw: Number(row.probability_draw),
    pool_a: String(row.pool_a),
    pool_b: String(row.pool_b),
    pool_draw: String(row.pool_draw),
    total_pool: String(row.total_pool),
  };
}

/**
 * Records current implied probabilities for all active markets at a minute boundary.
 * The unique market/time/source key makes concurrent application instances safe.
 */
export async function recordProbabilitySnapshots(): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO probability_snapshots (
       market_id, sampled_at, source, probability_a, probability_b, probability_draw,
       pool_a, pool_b, pool_draw, total_pool
     )
     SELECT market_id, date_trunc('minute', statement_timestamp()), 'interval',
       CASE WHEN total_pool > 0 THEN pool_a / total_pool ELSE 1.0 / 3.0 END,
       CASE WHEN total_pool > 0 THEN pool_b / total_pool ELSE 1.0 / 3.0 END,
       CASE WHEN total_pool > 0 THEN pool_draw / total_pool ELSE 1.0 / 3.0 END,
       pool_a, pool_b, pool_draw, total_pool
     FROM markets
     WHERE status IN ('open', 'locked')
     ON CONFLICT (market_id, sampled_at, source) DO NOTHING
     RETURNING market_id`,
  );
  return rows.length;
}

/**
 * Records an event-driven snapshot after the market state has been updated.
 */
export async function recordProbabilitySnapshot(market_id: string): Promise<void> {
  await pool.query(
    `INSERT INTO probability_snapshots (
       market_id, source, probability_a, probability_b, probability_draw,
       pool_a, pool_b, pool_draw, total_pool
     )
     SELECT market_id, 'event',
       CASE WHEN total_pool > 0 THEN pool_a / total_pool ELSE 1.0 / 3.0 END,
       CASE WHEN total_pool > 0 THEN pool_b / total_pool ELSE 1.0 / 3.0 END,
       CASE WHEN total_pool > 0 THEN pool_draw / total_pool ELSE 1.0 / 3.0 END,
       pool_a, pool_b, pool_draw, total_pool
     FROM markets
     WHERE market_id = $1`,
    [market_id],
  );
}

/**
 * Returns historical implied probabilities in ascending sampling order.
 */
export async function getProbabilityHistory(
  market_id: string,
  filters: ProbabilityHistoryFilters,
): Promise<ProbabilitySnapshot[]> {
  const market = await pool.query('SELECT 1 FROM markets WHERE market_id = $1', [market_id]);
  if (market.rows.length === 0) throw AppError.notFound(`Market not found: ${market_id}`);

  const values: unknown[] = [market_id];
  const conditions = ['market_id = $1'];
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`sampled_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`sampled_at <= $${values.length}`);
  }
  values.push(filters.limit);

  const { rows } = await pool.query(
    `SELECT market_id, sampled_at, source, probability_a, probability_b, probability_draw,
            pool_a, pool_b, pool_draw, total_pool
     FROM probability_snapshots
     WHERE ${conditions.join(' AND ')}
     ORDER BY sampled_at ASC
     LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapProbabilitySnapshot);
}

/**
 * Returns paginated markets from the database.
 *
 * Steps:
 *   1. Check Redis cache — return cached result if fresh (TTL 30s)
 *   2. Apply filters, sorting, and pagination in PostgreSQL
 *   3. Store the paginated result in cache before returning
 *   1. Build WHERE clause from filters (status, category, weight class, fighter, date range)
 *   2. Apply pagination (LIMIT / OFFSET)
 *   3. Check Redis cache — return cached result if fresh (TTL 30s)
 *   4. Query DB if cache miss; store result in cache before returning
 *   5. Sort by scheduled_at DESC by default
 */
export async function getMarkets(
  filters?: MarketFilters,
  pagination?: Pagination,
): Promise<MarketListResult> {
  const statusKey = filters?.status ?? '';
  const categoryKey = filters?.category ?? filters?.weight_class ?? '';
  const searchKey = filters?.search?.trim() ?? '';
  const categoryKey = filters?.category ?? '';
  const weightKey = filters?.weight_class ?? '';
  const fighterKey = filters?.fighter ?? '';
  const dateFromKey = filters?.dateFrom?.toISOString() ?? '';
  const dateToKey = filters?.dateTo?.toISOString() ?? '';
  const sortKey = filters?.sort ?? 'date_desc';
  const page = pagination?.page ?? 1;
  const limit = pagination?.limit ?? 50;
  const cacheKey = `markets:${JSON.stringify({
    status: statusKey,
    category: categoryKey,
    search: searchKey,
    fighter: fighterKey,
    dateFrom: dateFromKey,
    dateTo: dateToKey,
    sort: sortKey,
    page,
    limit,
  })}`;
  const cacheKey = `markets:${statusKey}:${categoryKey}:${weightKey}:${fighterKey}:${dateFromKey}:${dateToKey}:${sortKey}:${page}:${limit}`;
  const cached = await cache.get<MarketListResult>(cacheKey);
  if (cached) return cached;

  let result: MarketListResult;
  if (_db) {
    const markets = await db().findMarkets(filters);
    const filtered = markets.filter((market) => {
      if (filters?.status && market.status !== filters.status) return false;
      const category = filters?.category ?? filters?.weight_class;
      if (category && market.weight_class.toLowerCase() !== category.toLowerCase()) return false;
      if (searchKey) {
        const searchTerms = searchKey.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
        const searchableText =
          `${market.fighter_a} ${market.fighter_b} ${market.weight_class} ${market.venue}`.toLowerCase();
        const searchableTerms = new Set(searchableText.match(/[\p{L}\p{N}_]+/gu) ?? []);
        if (!searchTerms.every((term) => searchableTerms.has(term))) return false;
      }
      if (filters?.category && !getMarketCategoryDescendants(filters.category).includes(market.category)) return false;
      if (filters?.weight_class && market.weight_class !== filters.weight_class) return false;
      if (filters?.fighter) {
        const fighterLower = filters.fighter.toLowerCase();
        if (!market.fighter_a.toLowerCase().includes(fighterLower) && 
            !market.fighter_b.toLowerCase().includes(fighterLower)) {
          return false;
        }
      }
      if (filters?.dateFrom && new Date(market.scheduled_at) < filters.dateFrom) return false;
      if (filters?.dateTo && new Date(market.scheduled_at) > filters.dateTo) return false;
      return true;
    });

    let sorted: Market[];
    if (filters?.sort === 'date_asc') {
      sorted = [...filtered].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    } else if (filters?.sort === 'pool_desc') {
      sorted = [...filtered].sort((a, b) => Number(b.total_pool) - Number(a.total_pool));
    } else {
      sorted = [...filtered].sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());
    }

    const offset = (page - 1) * limit;
    const paged = sorted.slice(offset, offset + limit);
    result = { markets: paged, total: sorted.length };
  } else {
    const { whereSql, values } = buildMarketWhere(filters);
    const whereClauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      values.push(filters.status);
      whereClauses.push(`status = $${values.length}`);
    }
    if (filters?.weight_class) {
      values.push(filters.weight_class);
      whereClauses.push(`weight_class = $${values.length}`);
    }
    if (filters?.category) {
      values.push(getMarketCategoryDescendants(filters.category));
      whereClauses.push(`category = ANY($${values.length}::text[])`);
    }
    if (filters?.fighter) {
      values.push(`%${filters.fighter}%`);
      whereClauses.push(`(fighter_a ILIKE $${values.length} OR fighter_b ILIKE $${values.length})`);
    }
    if (filters?.dateFrom) {
      values.push(filters.dateFrom);
      whereClauses.push(`scheduled_at >= $${values.length}`);
    }
    if (filters?.dateTo) {
      values.push(filters.dateTo);
      whereClauses.push(`scheduled_at <= $${values.length}`);
    }

    whereClauses.unshift('deleted_at IS NULL');
    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;
    const orderBySql = 
      filters?.sort === 'date_asc' ? 'ORDER BY scheduled_at ASC' :
      filters?.sort === 'pool_desc' ? 'ORDER BY total_pool DESC' :
      'ORDER BY scheduled_at DESC';
    const offset = (page - 1) * limit;

    const rows = await pool.query(
      `SELECT * FROM markets ${whereSql} ${orderBySql} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    const countRows = await pool.query(
      `SELECT COUNT(*) AS total FROM markets ${whereSql}`,
      values,
    );

    result = {
      markets: rows.rows.map((row) => ({
        ...row,
        scheduled_at: new Date(row.scheduled_at),
        created_at: new Date(row.created_at),
        updated_at: new Date(row.updated_at),
        resolved_at: row.resolved_at ? new Date(row.resolved_at) : null,
      } as Market)),
      total: Number(countRows.rows[0]?.total ?? 0),
    };
  }

  await cache.set(cacheKey, result, 30);
  return result;
}

/**
 * Invalidates cache for a market when it's updated.
 * Clears the market cache and related pattern caches.
 */
export async function invalidateMarketCache(market_id: string): Promise<void> {
  await cache.del(`market:${market_id}`);
  await cache.delPattern(`markets:*`);
  await cache.del(`market:${market_id}:stats`);
}

// ---------------------------------------------------------------------------
// Autocomplete suggestions
// ---------------------------------------------------------------------------

export interface FighterSuggestion {
  name: string;
  market_id: string;
  side: 'a' | 'b';
}

/**
 * Returns up to `limit` distinct fighter names that ILIKE-match the query.
 *
 * When a real DB is available it runs a direct parameterised query.
 * When a mock DbAdapter is injected (tests) it scans the adapter's findMarkets result.
 *
 * Results are cached for 10 seconds (suggestions are cheap but called on every keystroke).
 */
export async function getFighterSuggestions(
  query: string,
  limit = 8,
): Promise<FighterSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const cacheKey = `suggestions:${trimmed.toLowerCase()}:${limit}`;
  const cached = await cache.get<FighterSuggestion[]>(cacheKey);
  if (cached) return cached;

  let suggestions: FighterSuggestion[];

  if (_db) {
    // Mock-adapter path: scan all markets and filter in-process
    const markets = await db().findMarkets();
    const lower = trimmed.toLowerCase();
    const seen = new Set<string>();
    suggestions = [];

    for (const market of markets) {
      if (suggestions.length >= limit) break;
      if (market.fighter_a.toLowerCase().includes(lower) && !seen.has(market.fighter_a)) {
        seen.add(market.fighter_a);
        suggestions.push({ name: market.fighter_a, market_id: String(market.market_id), side: 'a' });
      }
      if (suggestions.length < limit && market.fighter_b.toLowerCase().includes(lower) && !seen.has(market.fighter_b)) {
        seen.add(market.fighter_b);
        suggestions.push({ name: market.fighter_b, market_id: String(market.market_id), side: 'b' });
      }
    }
  } else {
    // Real DB path: use UNION to query both fighter columns efficiently
    const { rows } = await pool.query<{ name: string; market_id: string; side: 'a' | 'b' }>(
      `SELECT fighter_a AS name, market_id::text AS market_id, 'a'::text AS side
         FROM markets
        WHERE fighter_a ILIKE $1
       UNION
       SELECT fighter_b AS name, market_id::text AS market_id, 'b'::text AS side
         FROM markets
        WHERE fighter_b ILIKE $1
        LIMIT $2`,
      [`%${trimmed}%`, limit],
    );
    suggestions = rows;
  }

  await cache.set(cacheKey, suggestions, 10);
  return suggestions;
}



/**
 * Returns a single market by its on-chain market_id string, enriched with
 * live odds from getMarketOdds().
 *
 * Steps:
 *   1. Check Redis cache — return cached result if fresh (TTL 10s)
 *   2. Query DB; throw AppError 404 if no row found
 *   3. Fetch live odds via getMarketOdds()
 *   4. Merge market + odds, store in cache for 10 seconds, then return
 */
export async function getMarketById(market_id: string): Promise<MarketWithOdds> {
  const cacheKey = `market:${market_id}`;
  const cached = await cache.get<MarketWithOdds>(cacheKey);
  if (cached) return cached;

  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  const odds = await calculateOdds(market_id);
  const result: MarketWithOdds = {
    ...market,
    odds: { fighterA: odds.fighterA, fighterB: odds.fighterB, draw: odds.draw },
  };

  await cache.set(cacheKey, result, 10);
  return result;
}

/**
 * Returns live odds for a market.
 *
 * Formula: odds_x = floor((total_pool - fee) * 10_000 / pool_side)
 * Uses the net pool (total minus platform fee) to compute the actual payout
 * multiplier each outcome would return per unit staked.
 * Falls back to querying the Market contract via StellarService.readContractState()
 * if DB pool sizes are stale (updated_at older than 30 seconds).
 */
export async function getMarketOdds(market_id: string): Promise<MarketOdds> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  const now = new Date();
  const isStale = (now.getTime() - market.updated_at.getTime()) > 30_000; // 30 seconds

  let pool_a: bigint, pool_b: bigint, pool_draw: bigint, total_pool: bigint;

  if (isStale) {
    // Fallback to on-chain read
    // Assume readContractState returns { pool_a: string, pool_b: string, pool_draw: string, total_pool: string }
    const onChainData = await StellarService.readContractState(market.contract_address, 'get_pools', []) as { pool_a: string; pool_b: string; pool_draw: string; total_pool: string };
    pool_a = BigInt(onChainData.pool_a);
    pool_b = BigInt(onChainData.pool_b);
    pool_draw = BigInt(onChainData.pool_draw);
    total_pool = BigInt(onChainData.total_pool);
  } else {
    pool_a = BigInt(market.pool_a);
    pool_b = BigInt(market.pool_b);
    pool_draw = BigInt(market.pool_draw);
    total_pool = BigInt(market.total_pool);
  }

  // No bets placed yet — return equal implied probabilities (33.33%) instead
  // of dividing by zero, which would surface as NaN/Infinity → null in JSON.
  if (total_pool === 0n) {
    const EQUAL_PROBABILITY_BPS = Math.round(10000 / 3);
    return { odds_a: EQUAL_PROBABILITY_BPS, odds_b: EQUAL_PROBABILITY_BPS, odds_draw: EQUAL_PROBABILITY_BPS };
  }

  const fee = (total_pool * BigInt(market.fee_bps)) / 10000n;
  const net_pool = total_pool - fee;

  return {
    odds_a: pool_a === 0n ? 0 : Number((pool_a * 10000n) / total_pool),
    odds_b: pool_b === 0n ? 0 : Number((pool_b * 10000n) / total_pool),
    odds_draw: pool_draw === 0n ? 0 : Number((pool_draw * 10000n) / total_pool),
  };
}

/**
 * Calculates parimutuel odds for a market.
 * 
 * Formula: odds_x = total_pool / outcome_pool
 * Returns all three odds as floats rounded to 2 decimal places.
 * Returns { fighterA: 0, fighterB: 0, draw: 0 } for empty pools.
 */
export async function calculateOdds(market_id: string): Promise<{ fighterA: number; fighterB: number; draw: number }> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  const total_pool = BigInt(market.total_pool);
  const pool_a = BigInt(market.pool_a);
  const pool_b = BigInt(market.pool_b);
  const pool_draw = BigInt(market.pool_draw);

  if (total_pool === 0n) {
    return { fighterA: 0, fighterB: 0, draw: 0 };
  }

  const fighterA = pool_a === 0n ? 0 : Number((total_pool * 100n) / pool_a) / 100;
  const fighterB = pool_b === 0n ? 0 : Number((total_pool * 100n) / pool_b) / 100;
  const draw = pool_draw === 0n ? 0 : Number((total_pool * 100n) / pool_draw) / 100;

  return {
    fighterA: Math.round(fighterA * 100) / 100,
    fighterB: Math.round(fighterB * 100) / 100,
    draw: Math.round(draw * 100) / 100,
  };
}

/** Shared pool loader for odds calculations. */
async function loadMarketPools(market_id: string) {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);
  return {
    totalPool: BigInt(market.total_pool),
    poolA: BigInt(market.pool_a),
    poolB: BigInt(market.pool_b),
    poolDraw: BigInt(market.pool_draw),
    feeBps: BigInt(market.fee_bps),
    totalPoolStr: market.total_pool,
  };
}

/** Build an OutcomeOdds from raw pool values. */
function computeOutcomeOdds(
  pool: bigint,
  totalPool: bigint,
  feeBps: bigint,
  outcome: string,
  totalPoolStr: string,
): OutcomeOdds {
  if (totalPool === 0n || pool === 0n) {
    return { outcome, multiplier: 0, implied_probability: 0, pool: pool.toString(), total_pool: totalPoolStr };
  }
  const fee = (totalPool * feeBps) / 10000n;
  const netPool = totalPool - fee;
  const multiplier = Number((netPool * 10000n) / pool) / 10000;
  const implied_probability = Number((pool * 10000n) / totalPool) / 100;
  return {
    outcome,
    multiplier: Math.round(multiplier * 100) / 100,
    implied_probability: Math.round(implied_probability * 100) / 100,
    pool: pool.toString(),
    total_pool: totalPoolStr,
  };
}

/**
 * Calculates parimutuel odds for a single specific outcome.
 *
 * Parimutuel formula:
 *   multiplier = (total_pool - fee) / outcome_pool
 *   implied_probability = outcome_pool / total_pool
 *
 * Returns zero multiplier/probability for empty pools.
 */
export async function calculateSingleOutcomeOdds(
  market_id: string,
  outcome: 'fighter_a' | 'fighter_b' | 'draw',
): Promise<OutcomeOdds> {
  const { totalPool, poolA, poolB, poolDraw, feeBps, totalPoolStr } = await loadMarketPools(market_id);
  const pool = outcome === 'fighter_a' ? poolA : outcome === 'fighter_b' ? poolB : poolDraw;
  return computeOutcomeOdds(pool, totalPool, feeBps, outcome, totalPoolStr);
}

/**
 * Calculates parimutuel odds for all three outcomes.
 *
 * Parimutuel formula (per outcome):
 *   multiplier = (total_pool - fee) / outcome_pool
 *   implied_probability = outcome_pool / total_pool
 *
 * Returns zeros for outcomes with empty pools.
 */
export async function calculateOutcomeOdds(
  market_id: string,
): Promise<AllOutcomeOdds> {
  const { totalPool, poolA, poolB, poolDraw, feeBps, totalPoolStr } = await loadMarketPools(market_id);

  return {
    market_id,
    fighter_a: computeOutcomeOdds(poolA, totalPool, feeBps, 'fighter_a', totalPoolStr),
    fighter_b: computeOutcomeOdds(poolB, totalPool, feeBps, 'fighter_b', totalPoolStr),
    draw: computeOutcomeOdds(poolDraw, totalPool, feeBps, 'draw', totalPoolStr),
    total_pool: totalPoolStr,
  };
}

/**
 * Returns all bets placed by a given Stellar address across all markets.
 * Returns an empty array (never 404) when the address has no bets.
 */
export async function getBetsByAddress(bettor_address: string): Promise<Bet[]> {
  if (_db) {
    return db().findBetsByAddress(bettor_address);
  }

  const { rows } = await pool.query(
    'SELECT * FROM bets WHERE bettor_address = $1 ORDER BY placed_at DESC',
    [bettor_address],
  );

  return rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as Bet));
}

export async function getBettorStats(bettor_address: string): Promise<BettorStats> {
  const cacheKey = `bettor:${bettor_address}:stats`;
  const cached = await cache.get<BettorStats>(cacheKey);
  if (cached) return cached;

  const bets = await getBetsByAddress(bettor_address);
  const total_bets = bets.length;
  const total_wagered_xlm = bets.reduce((sum, bet) => sum + Number(bet.amount) / 10_000_000, 0);
  const total_winnings_xlm = bets
    .filter((bet) => bet.claimed && bet.payout)
    .reduce((sum, bet) => sum + Number(bet.payout ?? '0') / 10_000_000, 0);

  const outcomeCounts = bets.reduce<Record<string, number>>((counts, bet) => {
    counts[bet.side] = (counts[bet.side] ?? 0) + 1;
    return counts;
  }, {});

  const favorite_fighter = Object.entries(outcomeCounts).reduce<string | null>((best, [side, count]) => {
    if (best === null) return side;
    return count > (outcomeCounts[best] ?? 0) ? side : best;
  }, null);

  const win_rate = total_bets === 0 ? 0 : Math.round((bets.filter((bet) => bet.claimed && bet.payout).length * 10000) / total_bets) / 100;

  const result: BettorStats = {
    bettor_address,
    total_wagered_xlm,
    total_winnings_xlm,
    total_bets,
    win_rate,
    favorite_fighter,
  };

  await cache.set(cacheKey, result, 60);
  return result;
}

/**
 * Returns all bets for a given market.
 * If bettor_address is provided, filters to only that bettor's bets.
 */
export async function getBetsByMarket(
  market_id: string,
  bettor_address?: string,
): Promise<Bet[]> {
  if (_db) {
    return db().findBetsByMarket(market_id, bettor_address);
  }

  const values: unknown[] = [market_id];
  let sql = `SELECT b.* FROM bets b
             JOIN markets m ON m.market_id = b.market_id
             WHERE b.market_id = $1 AND m.deleted_at IS NULL`;

  if (bettor_address) {
    values.push(bettor_address);
    sql += ` AND b.bettor_address = $${values.length}`;
  }

  sql += ' ORDER BY b.placed_at DESC';

  const { rows } = await pool.query(sql, values);
  return rows.map((row) => ({
    ...row,
    placed_at: new Date(row.placed_at),
    claimed_at: row.claimed_at ? new Date(row.claimed_at) : null,
  } as Bet));
}

/**
 * Returns aggregate statistics for a market.
 * Values are computed from the bets table, not from on-chain.
 * Results cached in Redis for 60 seconds.
 */
export async function getMarketStats(market_id: string): Promise<MarketStats> {
  const cacheKey = `market:${market_id}:stats`;
  const cached = await cache.get<MarketStats>(cacheKey);
  if (cached) return cached;

  const bets = await db().findBetsByMarket(market_id);

  const total_bets = bets.length;
  const unique_bettors = new Set(bets.map(b => b.bettor_address)).size;
  const amounts_xlm = bets.map(b => Number(b.amount) / 10_000_000);
  const largest_bet_xlm = amounts_xlm.length > 0 ? Math.max(...amounts_xlm) : 0;
  const average_bet_xlm = amounts_xlm.length > 0 ? amounts_xlm.reduce((s, a) => s + a, 0) / amounts_xlm.length : 0;
  const total_pooled_xlm = amounts_xlm.reduce((s, a) => s + a, 0);

  const stats: MarketStats = {
    market_id,
    total_bets,
    unique_bettors,
    largest_bet_xlm,
    average_bet_xlm,
    total_pooled_xlm,
  };

  await cache.set(cacheKey, stats, 60);
  return stats;
}

/**
 * Returns platform-wide market analytics for research and reporting.
 */
export async function getMarketAnalytics() {
  const [overviewResult, statusResult, weightClassResult, topMarketsResult] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT COUNT(*) FROM markets) AS total_markets,
         (SELECT COUNT(*) FROM markets WHERE status = 'open') AS active_markets,
         (SELECT COALESCE(SUM(total_pool), 0) FROM markets) AS total_volume,
         (SELECT COUNT(*) FROM bets) AS total_bets,
         (SELECT COUNT(DISTINCT bettor_address) FROM bets) AS unique_bettors,
         (SELECT COALESCE(AVG(amount), 0) FROM bets) AS average_bet`,
    ),
    pool.query(
      `SELECT status, COUNT(*) AS market_count, COALESCE(SUM(total_pool), 0) AS total_volume
       FROM markets GROUP BY status ORDER BY status`,
    ),
    pool.query(
      `WITH market_totals AS (
         SELECT weight_class, COUNT(*) AS market_count, COALESCE(SUM(total_pool), 0) AS total_volume
         FROM markets GROUP BY weight_class
       ), bet_totals AS (
         SELECT m.weight_class, COUNT(b.id) AS total_bets
         FROM markets m LEFT JOIN bets b ON b.market_id = m.market_id
         GROUP BY m.weight_class
       )
       SELECT mt.weight_class, mt.market_count, mt.total_volume,
              COALESCE(bt.total_bets, 0) AS total_bets
       FROM market_totals mt LEFT JOIN bet_totals bt USING (weight_class)
       ORDER BY mt.total_volume DESC, mt.weight_class`,
    ),
    pool.query(
      `SELECT m.market_id, m.match_id, m.fighter_a, m.fighter_b, m.weight_class,
              m.status, m.total_pool, COUNT(b.id) AS total_bets,
              COUNT(DISTINCT b.bettor_address) AS unique_bettors
       FROM markets m LEFT JOIN bets b ON b.market_id = m.market_id
      GROUP BY m.market_id, m.match_id, m.fighter_a, m.fighter_b,
          m.weight_class, m.status, m.total_pool, m.scheduled_at
       ORDER BY m.total_pool DESC, total_bets DESC, m.scheduled_at ASC
       LIMIT 10`,
    ),
  ]);

  const overview = overviewResult.rows[0];
  return {
    totalMarkets: Number(overview.total_markets) || 0,
    activeMarkets: Number(overview.active_markets) || 0,
    totalVolumeXlm: (Number(overview.total_volume) || 0) / 10_000_000,
    totalBets: Number(overview.total_bets) || 0,
    uniqueBettors: Number(overview.unique_bettors) || 0,
    averageBetXlm: (Number(overview.average_bet) || 0) / 10_000_000,
    marketsByStatus: statusResult.rows.map((row) => ({
      status: row.status,
      marketCount: Number(row.market_count) || 0,
      totalVolumeXlm: (Number(row.total_volume) || 0) / 10_000_000,
    })),
    marketsByWeightClass: weightClassResult.rows.map((row) => ({
      weightClass: row.weight_class,
      marketCount: Number(row.market_count) || 0,
      totalVolumeXlm: (Number(row.total_volume) || 0) / 10_000_000,
      totalBets: Number(row.total_bets) || 0,
    })),
    topMarkets: topMarketsResult.rows.map((row) => ({
      ...row,
      total_pool_xlm: (Number(row.total_pool) || 0) / 10_000_000,
      total_bets: Number(row.total_bets) || 0,
      unique_bettors: Number(row.unique_bettors) || 0,
    })),
  };
}

/**
 * Recommends open markets using a user's past weight-class activity, with
 * popular open markets as a useful fallback for users without betting history.
 */
export async function getRecommendedMarkets(userId: string, limit = 10) {
  const { rows: userRows } = await pool.query(
    'SELECT stellar_address FROM users WHERE id = $1',
    [userId],
  );
  const bettorAddress = userRows[0]?.stellar_address as string | null | undefined;

  const { rows } = await pool.query(
    `WITH preferences AS (
       SELECT m.weight_class, COUNT(*) AS preference_score
       FROM bets b JOIN markets m ON m.market_id = b.market_id
       WHERE b.bettor_address = $1
       GROUP BY m.weight_class
     )
     SELECT m.*, COALESCE(p.preference_score, 0) AS personalization_score,
            CASE WHEN p.weight_class IS NULL THEN 'popular' ELSE 'based_on_history' END AS recommendation_reason
     FROM markets m
     LEFT JOIN preferences p ON p.weight_class = m.weight_class
     WHERE m.status = 'open'
       AND ($1::text IS NULL OR NOT EXISTS (
         SELECT 1 FROM bets mine WHERE mine.market_id = m.market_id AND mine.bettor_address = $1
       ))
     ORDER BY p.preference_score DESC NULLS LAST, m.total_pool DESC, m.scheduled_at ASC
     LIMIT $2`,
    [bettorAddress || null, limit],
  );

  return {
    personalized: Boolean(bettorAddress),
    markets: rows.map((row) => ({
      ...row,
      personalization_score: Number(row.personalization_score) || 0,
      total_pool_xlm: (Number(row.total_pool) || 0) / 10_000_000,
    })),
  };
}

/**
 * Returns a portfolio summary for a Stellar address.
 *
 * active_bets:    bets in Open/Locked markets
 * past_bets:      bets in Resolved/Cancelled markets
 * pending_claims: unclaimed winning bets in Resolved markets
 * Totals are computed in XLM (divide stroops by 10_000_000).
 */
export async function getPortfolioByAddress(
  bettor_address: string,
): Promise<Portfolio> {
  const bets = await db().findBetsByAddress(bettor_address);
  const marketIds = [...new Set(bets.map(b => b.market_id))];
  const markets = await Promise.all(marketIds.map(id => db().findMarketById(id)));
  const marketMap = new Map(markets.filter(Boolean).map(m => [m!.market_id, m!]));

  const active_bets: Bet[] = [];
  const past_bets: Bet[] = [];
  const pending_claims: Bet[] = [];

  for (const bet of bets) {
    const market = marketMap.get(bet.market_id);
    const status = market?.status;
    if (status === 'open' || status === 'locked') {
      active_bets.push(bet);
    } else {
      past_bets.push(bet);
      if (status === 'resolved' && !bet.claimed && market?.outcome === bet.side) {
        pending_claims.push(bet);
      }
    }
  }

  const total_staked_xlm = bets.reduce((s, b) => s + Number(b.amount) / 10_000_000, 0);
  const total_won_xlm = bets
    .filter(b => b.claimed && b.payout)
    .reduce((s, b) => s + Number(b.payout) / 10_000_000, 0);
  const total_lost_xlm = past_bets
    .filter(b => !b.claimed && !pending_claims.includes(b))
    .reduce((s, b) => s + Number(b.amount) / 10_000_000, 0);

  return {
    address: bettor_address,
    active_bets,
    past_bets,
    total_staked_xlm,
    total_won_xlm,
    total_lost_xlm,
    pending_claims,
  };
}

/**
 * Simulates projected payout for a hypothetical bet on a market.
 *
 * Parimutuel formula:
 *   payout = (hypothetical_amount / outcome_pool) * (total_pool - fee)
 *
 * Returns zero if the outcome pool is empty or the market is cancelled.
 */
export async function simulateProjectedPayout(
  market_id: string,
  amount: string,
  outcome: 'fighter_a' | 'fighter_b' | 'draw',
): Promise<ProjectedPayout> {
  const market = await db().findMarketById(market_id);
  if (!market) throw AppError.notFound(`Market not found: ${market_id}`);

  if (market.status === 'cancelled') {
    return { amount: '0', formatted_xlm: 0 };
  }

  const betAmount = BigInt(amount);
  if (betAmount <= 0n) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const total_pool = BigInt(market.total_pool);
  const fee_bps = market.fee_bps;
  const fee = (total_pool * BigInt(fee_bps)) / 10000n;
  const pool_after_fee = total_pool - fee;

  let winning_pool: bigint;
  if (outcome === 'fighter_a') {
    winning_pool = BigInt(market.pool_a);
  } else if (outcome === 'fighter_b') {
    winning_pool = BigInt(market.pool_b);
  } else {
    winning_pool = BigInt(market.pool_draw);
  }

  if (winning_pool <= 0n) {
    return { amount: '0', formatted_xlm: 0 };
  }

  const payout = (betAmount * pool_after_fee) / winning_pool;
  const formatted_xlm = Number(payout) / 10_000_000;

  return {
    amount: payout.toString(),
    formatted_xlm,
  };
}

/**
 * Returns aggregate platform statistics for the home page banner.
 * Queries: COUNT(*) WHERE status='Open', SUM(total_pool), COUNT(bets)
 * Results cached in Redis for 60 seconds.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const cacheKey = 'platform:stats';
  const cached = await cache.get<PlatformStats>(cacheKey);
  if (cached) return cached;

  if (_db) {
    // If using test adapter, compute from in-memory data
    const allMarkets = await db().findMarkets();
    const openMarkets = allMarkets.filter(m => m.status === 'open');
    const allBets = await Promise.all(
      allMarkets.map(m => db().findBetsByMarket(m.market_id))
    ).then(results => results.flat());

    const totalVolume = allMarkets.reduce((sum, m) => sum + Number(m.total_pool) / 10_000_000, 0);

    const stats: PlatformStats = {
      totalMarkets: allMarkets.length,
      activeMarkets: openMarkets.length,
      totalVolume,
      totalBets: allBets.length,
    };

    await cache.set(cacheKey, stats, 60);
    return stats;
  }

  const marketsResult = await pool.query(
    "SELECT COUNT(*) as total, SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as active, SUM(total_pool) as volume FROM markets WHERE deleted_at IS NULL"
  );

  const betsResult = await pool.query('SELECT COUNT(*) as total FROM bets');

  const { total: totalMarkets, active: activeMarkets, volume: totalPoolStroops } = marketsResult.rows[0];
  const { total: totalBets } = betsResult.rows[0];

  const stats: PlatformStats = {
    totalMarkets: Number(totalMarkets) || 0,
    activeMarkets: Number(activeMarkets) || 0,
    totalVolume: (Number(totalPoolStroops) || 0) / 10_000_000,
    totalBets: Number(totalBets) || 0,
  };

  await cache.set(cacheKey, stats, 60);
  return stats;
}

// ---------------------------------------------------------------------------
// Bulk operations
// ---------------------------------------------------------------------------

export interface BulkResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

/**
 * Pauses (locks) up to 50 open markets in a single admin action.
 * Each market is processed independently — failures do not abort others.
 */
export async function bulkPauseMarkets(marketIds: string[]): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of marketIds) {
    try {
      const market = await db().findMarketById(id);
      if (!market) {
        result.failed.push({ id, reason: 'Market not found' });
        continue;
      }
      validateStatusTransition(market.status, 'locked');
      const { rows } = await pool.query(
        `UPDATE markets SET status = 'locked', updated_at = NOW()
         WHERE market_id = $1 AND status = 'open'
         RETURNING market_id`,
        [id],
      );
      if (rows.length === 0) {
        result.failed.push({ id, reason: 'Market not found or not in open status' });
      } else {
        await invalidateMarketCache(id);
        result.succeeded.push(id);
      }
    } catch (err) {
      result.failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

/**
 * Cancels up to 50 open/locked markets and enqueues notifications for all
 * position holders of each successfully cancelled market.
 * Each market is processed independently — failures do not abort others.
 */
export async function bulkCancelMarkets(
  marketIds: string[],
  reason: string,
): Promise<BulkResult> {
  const result: BulkResult = { succeeded: [], failed: [] };

  for (const id of marketIds) {
    try {
      const { rows } = await pool.query(
        `UPDATE markets SET status = 'cancelled', updated_at = NOW()
         WHERE market_id = $1 AND status IN ('open', 'locked')
         RETURNING market_id`,
        [id],
      );
      if (rows.length === 0) {
        result.failed.push({ id, reason: 'Market not found or not cancellable' });
        continue;
      }

      await invalidateMarketCache(id);

      // Enqueue notifications for all position holders
      const bettors = await pool.query(
        `SELECT DISTINCT bettor_address FROM bets WHERE market_id = $1`,
        [id],
      );
      if (bettors.rows.length > 0) {
        const values = bettors.rows
          .map((_: unknown, i: number) => `($${i * 4 + 1}, $${i * 4 + 2}, 'market_cancelled', 'pending', NOW())`)
          .join(', ');
        const params = bettors.rows.flatMap((r: { bettor_address: string }) => [r.bettor_address, id]);
        await pool.query(
          `INSERT INTO notification_jobs (bettor_address, market_id, job_type, status, created_at) VALUES ${values}`,
          params,
        );
      }

      result.succeeded.push(id);
    } catch (err) {
      result.failed.push({ id, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
