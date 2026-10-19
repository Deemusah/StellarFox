// ============================================================
// BANKERCHANGER — Leaderboard Controller
// Public leaderboard ranked by net profit, with period filtering
// and an authenticated "my rank" endpoint.
// ============================================================

import type { Request, Response } from 'express';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';

/** Valid period values and their corresponding SQL date filter expressions. */
const PERIOD_FILTERS: Record<string, string> = {
  daily: `AND b.created_at >= NOW() - INTERVAL '1 day'`,
  weekly: `AND b.created_at >= NOW() - INTERVAL '7 days'`,
  monthly: `AND b.created_at >= NOW() - INTERVAL '30 days'`,
  all_time: '',
};

type Period = keyof typeof PERIOD_FILTERS;

export class LeaderboardController {
  /**
   * GET /api/leaderboard
   * Public. Returns a paginated leaderboard of users ranked by net profit.
   *
   * Query params:
   *   period  — daily | weekly | monthly | all_time  (default: all_time)
   *   page    — 1-indexed page number                (default: 1)
   *   limit   — entries per page, max 100            (default: 20)
   */
  async getLeaderboard(req: Request, res: Response): Promise<void> {
    const periodParam = (req.query.period as string | undefined) ?? 'all_time';
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const rawLimit = parseInt((req.query.limit as string) || '20', 10);
    const limit = Math.min(100, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

    if (!(periodParam in PERIOD_FILTERS)) {
      throw new AppError(
        400,
        `Invalid period. Valid values: ${Object.keys(PERIOD_FILTERS).join(', ')}`,
      );
    }

    const period = periodParam as Period;
    const periodFilter = PERIOD_FILTERS[period];
    const offset = (page - 1) * limit;

    // --- Main rankings query ---
    const rankingsQuery = `
      SELECT
        u.id                                                                        AS user_id,
        COALESCE(u.username, 'Anonymous')                                           AS username,
        COUNT(b.id)::int                                                            AS total_bets,
        COUNT(
          CASE WHEN b.payout IS NOT NULL AND b.payout::numeric > b.amount::numeric
               THEN 1 END
        )::int                                                                      AS winning_bets,
        COALESCE(SUM(b.amount::numeric), 0)::text                                  AS total_volume,
        COALESCE(
          SUM(b.payout::numeric - b.amount::numeric)
            FILTER (WHERE b.payout IS NOT NULL),
          0
        )::text                                                                     AS net_profit,
        CASE
          WHEN COUNT(b.id) > 0 THEN
            ROUND(
              (COUNT(
                CASE WHEN b.payout IS NOT NULL AND b.payout::numeric > b.amount::numeric
                     THEN 1 END
              )::numeric / COUNT(b.id)) * 100,
              2
            )
          ELSE 0
        END                                                                         AS win_rate
      FROM users u
      LEFT JOIN bets b ON b.bettor_address = u.id ${periodFilter}
      GROUP BY u.id, u.username
      ORDER BY net_profit::numeric DESC NULLS LAST
      LIMIT $1 OFFSET $2
    `;

    // --- Total count query (for pagination metadata) ---
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) AS total
      FROM users u
      LEFT JOIN bets b ON b.bettor_address = u.id ${periodFilter}
    `;

    const [rankingsResult, countResult] = await Promise.all([
      pool.query(rankingsQuery, [limit, offset]),
      pool.query<{ total: string }>(countQuery),
    ]);

    const total = Number(countResult.rows[0]?.total ?? 0);

    // Attach a 1-based rank number to each entry
    const rankings = rankingsResult.rows.map((row, index) => ({
      rank: offset + index + 1,
      user_id: row.user_id,
      username: row.username,
      total_bets: row.total_bets,
      winning_bets: row.winning_bets,
      total_volume: row.total_volume,
      net_profit: row.net_profit,
      win_rate: Number(row.win_rate),
    }));

    res.status(200).json({
      success: true,
      period,
      page,
      limit,
      total,
      rankings,
    });
  }

  /**
   * GET /api/leaderboard/me
   * Authenticated. Returns the calling user's rank, stats, and surrounding
   * context on the all-time leaderboard.
   *
   * The rank is determined by counting how many users have a strictly higher
   * net_profit, then adding 1.
   */
  async getMyRank(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId as string;

    // Compute the rank via a subquery: rank = number of users with a higher
    // net_profit than the current user + 1.
    const rankQuery = `
      WITH user_profits AS (
        SELECT
          u.id                                                                      AS user_id,
          COALESCE(u.username, 'Anonymous')                                         AS username,
          COUNT(b.id)::int                                                          AS total_bets,
          COUNT(
            CASE WHEN b.payout IS NOT NULL AND b.payout::numeric > b.amount::numeric
                 THEN 1 END
          )::int                                                                    AS winning_bets,
          COALESCE(SUM(b.amount::numeric), 0)::text                                AS total_volume,
          COALESCE(
            SUM(b.payout::numeric - b.amount::numeric)
              FILTER (WHERE b.payout IS NOT NULL),
            0
          )::numeric                                                                AS net_profit,
          CASE
            WHEN COUNT(b.id) > 0 THEN
              ROUND(
                (COUNT(
                  CASE WHEN b.payout IS NOT NULL AND b.payout::numeric > b.amount::numeric
                       THEN 1 END
                )::numeric / COUNT(b.id)) * 100,
                2
              )
            ELSE 0
          END                                                                       AS win_rate
        FROM users u
        LEFT JOIN bets b ON b.bettor_address = u.id
        GROUP BY u.id, u.username
      ),
      my_stats AS (
        SELECT *
        FROM user_profits
        WHERE user_id = $1
      ),
      my_rank AS (
        SELECT
          (SELECT COUNT(*) FROM user_profits WHERE net_profit > (SELECT net_profit FROM my_stats)) + 1 AS rank,
          (SELECT COUNT(*) FROM user_profits) AS total_users
      )
      SELECT
        s.*,
        r.rank,
        r.total_users
      FROM my_stats s
      CROSS JOIN my_rank r
    `;

    const result = await pool.query(rankQuery, [userId]);

    if (result.rowCount === 0) {
      throw new AppError(404, 'User not found');
    }

    const row = result.rows[0];

    res.status(200).json({
      success: true,
      data: {
        rank: Number(row.rank),
        total_users: Number(row.total_users),
        user_id: row.user_id,
        username: row.username,
        total_bets: row.total_bets,
        winning_bets: row.winning_bets,
        total_volume: row.total_volume,
        net_profit: row.net_profit.toString(),
        win_rate: Number(row.win_rate),
      },
    });
  }
}

export const leaderboardController = new LeaderboardController();
