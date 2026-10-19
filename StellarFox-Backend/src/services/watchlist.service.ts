import { pool } from '../config/db';
import { AppError } from '../utils/AppError';

export interface WatchlistEntry {
  id: number;
  user_id: string;
  market_id: string;
  created_at: string;
}

export interface WatchlistMarketRow {
  id: string;
  title: string;
  status: string;
  fighter_a: string;
  fighter_b: string;
  closing_at: string;
  watchlisted_at: string;
}

export async function addToWatchlist(userId: string, marketId: string): Promise<WatchlistEntry> {
  // Verify market exists
  const marketCheck = await pool.query('SELECT id FROM markets WHERE id = $1', [marketId]);
  if (marketCheck.rowCount === 0) throw AppError.notFound('Market not found');

  try {
    const result = await pool.query<WatchlistEntry>(
      `INSERT INTO market_watchlist (user_id, market_id) VALUES ($1, $2) RETURNING *`,
      [userId, marketId],
    );
    return result.rows[0];
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException & { code?: string }).code === '23505') {
      throw AppError.conflict('Market already in watchlist', 'ALREADY_WATCHLISTED');
    }
    throw err;
  }
}

export async function removeFromWatchlist(userId: string, marketId: string): Promise<void> {
  const result = await pool.query(
    `DELETE FROM market_watchlist WHERE user_id = $1 AND market_id = $2`,
    [userId, marketId],
  );
  if ((result.rowCount ?? 0) === 0) throw AppError.notFound('Watchlist entry not found');
}

export async function getWatchlist(userId: string): Promise<WatchlistMarketRow[]> {
  const result = await pool.query<WatchlistMarketRow>(
    `SELECT m.id, m.title, m.status, m.fighter_a, m.fighter_b, m.closing_at, w.created_at AS watchlisted_at
     FROM market_watchlist w
     JOIN markets m ON m.id = w.market_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function isWatchlisted(userId: string, marketId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM market_watchlist WHERE user_id = $1 AND market_id = $2`,
    [userId, marketId],
  );
  return (result.rowCount ?? 0) > 0;
}
