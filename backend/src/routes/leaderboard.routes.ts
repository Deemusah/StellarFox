// ============================================================
// BANKERCHANGER — Leaderboard Routes
// GET /api/leaderboard     — public leaderboard (period, page, limit)
// GET /api/leaderboard/me  — authenticated user's rank
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { leaderboardController } from '../api/controllers/LeaderboardController';

const router = Router();

/**
 * @swagger
 * /api/leaderboard:
 *   get:
 *     summary: Get the global betting leaderboard ranked by net profit
 *     tags: [Leaderboard]
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [daily, weekly, monthly, all_time]
 *           default: all_time
 *         description: Time window for the leaderboard
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *           minimum: 1
 *         description: Page number (1-indexed)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 100
 *         description: Entries per page (max 100)
 *     responses:
 *       200:
 *         description: Paginated leaderboard
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 period:
 *                   type: string
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 total:
 *                   type: integer
 *                 rankings:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       rank:
 *                         type: integer
 *                       user_id:
 *                         type: string
 *                       username:
 *                         type: string
 *                       total_bets:
 *                         type: integer
 *                       winning_bets:
 *                         type: integer
 *                       total_volume:
 *                         type: string
 *                       net_profit:
 *                         type: string
 *                       win_rate:
 *                         type: number
 *       400:
 *         description: Invalid period parameter
 */
router.get(
  '/',
  (req, res, next) => {
    leaderboardController.getLeaderboard(req, res).catch(next);
  },
);

/**
 * @swagger
 * /api/leaderboard/me:
 *   get:
 *     summary: Get the authenticated user's leaderboard rank and stats
 *     tags: [Leaderboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's rank and betting stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     rank:
 *                       type: integer
 *                     total_users:
 *                       type: integer
 *                     user_id:
 *                       type: string
 *                     username:
 *                       type: string
 *                     total_bets:
 *                       type: integer
 *                     winning_bets:
 *                       type: integer
 *                     total_volume:
 *                       type: string
 *                     net_profit:
 *                       type: string
 *                     win_rate:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get(
  '/me',
  requireAuth,
  (req, res, next) => {
    leaderboardController.getMyRank(req, res).catch(next);
  },
);

export default router;
