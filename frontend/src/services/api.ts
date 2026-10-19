// ============================================================
// BANKERCHANGER — API Service
// Typed wrappers around the backend REST endpoints.
// Base URL is set from NEXT_PUBLIC_API_URL env variable.
// Contributors: implement every function marked TODO.
// ============================================================

import type {
  Bet,
  Market,
  MarketStats,
  Portfolio,
  UserStreak,
  Achievement,
  UserAchievement,
  Leaderboard,
  ReferralSummary,
  ReferralPayoutResult,
  UserNotification,
  WatchlistMarket,
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class NotFoundError extends Error {
  constructor(message = 'Not found') { super(message); this.name = 'NotFoundError'; }
}

export class NetworkError extends Error {
  constructor(message = 'Network error') { super(message); this.name = 'NetworkError'; }
}

export class TimeoutError extends Error {
  constructor(message = 'Request timeout (10s)') { super(message); this.name = 'TimeoutError'; }
}

const TIMEOUT_MS = 10000; // 10 seconds

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Bearer token — adds Authorization header when provided */
  token?: string;
};

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const method = options.method ?? 'GET';
  const init: RequestInit = { method, signal: controller.signal };

  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw new TimeoutError();
    }
    throw new NetworkError((e as Error).message);
  } finally {
    clearTimeout(timeoutId);
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new NetworkError(`Unexpected response: ${res.status} ${detail}`);
  }
  return res.json() as Promise<T>;
}

export const MARKET_CATEGORY_FILTERS = [
  'BOXING',
  'MMA',
  'KICKBOXING',
  'OTHER',
  'COMBAT_SPORTS',
] as const;

export type MarketCategoryFilter = (typeof MARKET_CATEGORY_FILTERS)[number];

export interface MarketFilters {
  status?: string;
  category?: MarketCategoryFilter;
  weight_class?: string;
  search?: string;
  sort?: 'date_asc' | 'date_desc' | 'pool_desc';
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface MarketListResponse {
  markets: Market[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Calls GET /api/markets with optional filters and pagination.
 * Returns typed MarketListResponse.
 * Throws NetworkError if the request fails.
 */
export async function fetchMarkets(
  filters?: MarketFilters,
  pagination?: PaginationParams,
): Promise<MarketListResponse> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.category) params.set('category', filters.category);
  if (filters?.weight_class) params.set('weight_class', filters.weight_class);
  if (filters?.search) params.set('search', filters.search);
  if (filters?.sort) params.set('sort', filters.sort);
  if (pagination?.page) params.set('page', pagination.page.toString());
  if (pagination?.limit) params.set('limit', pagination.limit.toString());
  const qs = params.toString();
  return apiFetch<MarketListResponse>(`/api/markets${qs ? `?${qs}` : ''}`);
}

export interface MarketSuggestion {
  /** Fighter name */
  name: string;
  /** Market this fighter appears in */
  market_id: string;
  /** Which fighter slot: 'a' or 'b' */
  side: 'a' | 'b';
}

export interface MarketSuggestionsResponse {
  suggestions: MarketSuggestion[];
}

/**
 * Calls GET /api/markets/search/suggestions?q=<query>&limit=<limit>.
 * Returns up to `limit` fighter name suggestions matching the query.
 * Throws NetworkError if the request fails.
 */
export async function fetchMarketSuggestions(
  query: string,
  limit = 8,
): Promise<MarketSuggestionsResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return apiFetch<MarketSuggestionsResponse>(
    `/api/markets/search/suggestions?${params.toString()}`,
  );
}

/**
 * Calls GET /api/markets/:market_id.
 * Returns the Market including live odds.
 * Throws NotFoundError on 404.
 */
export async function fetchMarketById(market_id: string): Promise<Market> {
  return apiFetch<Market>(`/api/markets/${market_id}`);
}

/**
 * Calls GET /api/markets/:market_id/bets.
 * Returns all bets for the market.
 */
export async function fetchBetsByMarket(market_id: string): Promise<Bet[]> {
  return apiFetch<Bet[]>(`/api/markets/${market_id}/bets`);
}

/**
 * Calls GET /api/portfolio/:address.
 * Returns the full Portfolio object.
 */
export async function fetchPortfolio(address: string): Promise<Portfolio> {
  return apiFetch<Portfolio>(`/api/portfolio/${address}`);
}

/**
 * Calls GET /api/markets/:market_id/stats.
 * Returns aggregate MarketStats.
 */
export async function fetchMarketStats(market_id: string): Promise<MarketStats> {
  return apiFetch<MarketStats>(`/api/markets/${market_id}/stats`);
}

// ---------------------------------------------------------------------------
// Engagement — User Experience & Social
// ---------------------------------------------------------------------------

/**
 * Calls GET /api/engagement/streak/:address.
 * Returns a user's prediction streak.
 */
export async function fetchUserStreak(address: string): Promise<UserStreak> {
  return apiFetch<UserStreak>(`/api/engagement/streak/${address}`);
}

/**
 * Calls POST /api/engagement/predictions.
 * Records a prediction and returns the updated streak + earned achievements.
 */
export async function recordPrediction(address: string): Promise<{
  streak: UserStreak;
  earnedAchievements: string[];
}> {
  return apiFetch<{ streak: UserStreak; earnedAchievements: string[] }>(
    '/api/engagement/predictions',
    { method: 'POST', body: { address } },
  );
}

/**
 * Calls GET /api/engagement/achievements.
 * Returns the achievement badge catalogue.
 */
export async function fetchAchievements(): Promise<Achievement[]> {
  return apiFetch<Achievement[]>('/api/engagement/achievements');
}

/**
 * Calls GET /api/engagement/achievements/:address.
 * Returns the badges a user has earned.
 */
export async function fetchUserAchievements(address: string): Promise<UserAchievement[]> {
  return apiFetch<UserAchievement[]>(`/api/engagement/achievements/${address}`);
}

/**
 * Calls GET /api/engagement/leaderboard.
 * Returns the global engagement leaderboard.
 */
export async function fetchLeaderboard(limit = 50): Promise<Leaderboard> {
  return apiFetch<Leaderboard>(`/api/engagement/leaderboard?limit=${limit}`);
}

/**
 * Calls GET /api/engagement/referrals/:address.
 * Returns a referral summary for the address.
 */
export async function fetchReferralSummary(address: string): Promise<ReferralSummary> {
  return apiFetch<ReferralSummary>(`/api/engagement/referrals/${address}`);
}

/**
 * Calls POST /api/engagement/referrals/payout.
 * Calculates expected referral payouts for an amount.
 */
export async function calculateReferralPayout(
  address: string,
  amount: number,
): Promise<ReferralPayoutResult> {
  return apiFetch<ReferralPayoutResult>('/api/engagement/referrals/payout', {
    method: 'POST',
    body: { address, amount },
  });
}

/**
 * Calls GET /api/engagement/notifications/:address.
 * Returns the user's notifications.
 */
export async function fetchNotifications(address: string, limit = 50): Promise<UserNotification[]> {
  return apiFetch<UserNotification[]>(
    `/api/engagement/notifications/${address}?limit=${limit}`,
  );
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

/**
 * Calls GET /api/watchlist.
 * Returns the authenticated user's watchlisted markets.
 */
export async function fetchWatchlist(token: string): Promise<WatchlistMarket[]> {
  return apiFetch<{ success: boolean; data: WatchlistMarket[] }>('/api/watchlist', {
    method: 'GET',
    token,
  }).then((r) => r.data);
}

/**
 * Calls POST /api/watchlist/:marketId.
 * Adds a market to the user's watchlist.
 */
export async function addToWatchlist(marketId: string, token: string): Promise<void> {
  await apiFetch(`/api/watchlist/${marketId}`, { method: 'POST', token });
}

/**
 * Calls DELETE /api/watchlist/:marketId.
 * Removes a market from the user's watchlist.
 */
export async function removeFromWatchlist(marketId: string, token: string): Promise<void> {
  await apiFetch(`/api/watchlist/${marketId}`, { method: 'DELETE', token });
}

/**
 * Calls GET /api/watchlist/:marketId/status.
 * Returns whether the given market is on the user's watchlist.
 */
export async function checkWatchlistStatus(
  marketId: string,
  token: string,
): Promise<boolean> {
  const res = await apiFetch<{ success: boolean; data: { watchlisted: boolean } }>(
    `/api/watchlist/${marketId}/status`,
    { method: 'GET', token },
  );
  return res.data.watchlisted;
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/**
 * Calls POST /api/feedback.
 * Submits user feedback. Auth is optional — anonymous submissions are accepted.
 */
export async function submitFeedback(
  input: {
    category: string;
    rating?: number;
    message: string;
    pageUrl?: string;
  },
  token?: string,
): Promise<{ id: number }> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  };
  if (token) (init.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  init.signal = controller.signal;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/feedback`, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new TimeoutError();
    throw new NetworkError((e as Error).message);
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new NetworkError(`Unexpected response: ${res.status} ${detail}`);
  }
  const data = await res.json() as { success: boolean; data: { id: number } };
  return data.data;
}

// ---------------------------------------------------------------------------
// Bug Reports
// ---------------------------------------------------------------------------

/**
 * Calls POST /api/bug-reports.
 * Submits a bug report. Auth is optional — anonymous submissions are accepted.
 */
export async function submitBugReport(
  input: {
    title: string;
    description: string;
    severity?: string;
    category?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    pageUrl?: string;
    browserInfo?: Record<string, unknown>;
  },
  token?: string,
): Promise<{ id: number }> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  };
  if (token) (init.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  init.signal = controller.signal;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/bug-reports`, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new TimeoutError();
    throw new NetworkError((e as Error).message);
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new NetworkError(`Unexpected response: ${res.status} ${detail}`);
  }
  const data = await res.json() as { success: boolean; data: { id: number } };
  return data.data;
}

import type {
  WatchlistMarket,
  RetentionConfig,
} from '../types';

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

/**
 * Calls POST /api/feedback.
 * Auth is optional — pass a token for logged-in users.
 */
export async function submitFeedback(
  input: {
    category: string;
    rating?: number;
    message: string;
    pageUrl?: string;
  },
  token?: string,
): Promise<{ id: number }> {
  const res = await apiFetch<{ success: boolean; data: { id: number } }>(
    '/api/feedback',
    { method: 'POST', body: input, token },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Bug Reports
// ---------------------------------------------------------------------------

/**
 * Calls POST /api/bug-reports.
 * Auth is optional — pass a token for logged-in users.
 */
export async function submitBugReport(
  input: {
    title: string;
    description: string;
    severity?: string;
    category?: string;
    stepsToReproduce?: string;
    expectedBehavior?: string;
    actualBehavior?: string;
    pageUrl?: string;
    browserInfo?: Record<string, unknown>;
  },
  token?: string,
): Promise<{ id: number }> {
  const res = await apiFetch<{ success: boolean; data: { id: number } }>(
    '/api/bug-reports',
    { method: 'POST', body: input, token },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Market Watchlist
// ---------------------------------------------------------------------------

/**
 * Calls GET /api/watchlist.
 * Returns the authenticated user's watchlisted markets.
 */
export async function fetchWatchlist(token: string): Promise<WatchlistMarket[]> {
  const res = await apiFetch<{ success: boolean; data: WatchlistMarket[] }>(
    '/api/watchlist',
    { token },
  );
  return res.data;
}

/**
 * Calls POST /api/watchlist/:marketId.
 * Adds a market to the authenticated user's watchlist.
 */
export async function addToWatchlist(
  marketId: string,
  token: string,
): Promise<void> {
  await apiFetch(`/api/watchlist/${encodeURIComponent(marketId)}`, {
    method: 'POST',
    token,
  });
}

/**
 * Calls DELETE /api/watchlist/:marketId.
 * Removes a market from the authenticated user's watchlist.
 */
export async function removeFromWatchlist(
  marketId: string,
  token: string,
): Promise<void> {
  await apiFetch(`/api/watchlist/${encodeURIComponent(marketId)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * Calls GET /api/watchlist/:marketId/status.
 * Returns whether a specific market is in the user's watchlist.
 */
export async function checkWatchlistStatus(
  marketId: string,
  token: string,
): Promise<boolean> {
  const res = await apiFetch<{
    success: boolean;
    data: { watchlisted: boolean };
  }>(`/api/watchlist/${encodeURIComponent(marketId)}/status`, { token });
  return res.data.watchlisted;
}

// ---------------------------------------------------------------------------
// Retention Configuration (admin)
// ---------------------------------------------------------------------------

/**
 * Calls GET /api/admin/retention.
 * Returns all retention configuration entries. Admin only.
 */
export async function fetchRetentionConfigs(
  token: string,
): Promise<RetentionConfig[]> {
  const res = await apiFetch<{ success: boolean; data: RetentionConfig[] }>(
    '/api/admin/retention',
    { token },
  );
  return res.data;
}

/**
 * Calls PUT /api/admin/retention/:dataType.
 * Creates or updates a retention configuration. Admin only.
 */
export async function upsertRetentionConfig(
  dataType: string,
  updates: { retentionDays?: number; enabled?: boolean; description?: string },
  token: string,
): Promise<RetentionConfig> {
  const res = await apiFetch<{ success: boolean; data: RetentionConfig }>(
    `/api/admin/retention/${encodeURIComponent(dataType)}`,
    { method: 'PUT', body: updates, token },
  );
  return res.data;
}
