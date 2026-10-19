import { Router, Request, Response, NextFunction } from 'express';
import { validate } from '../api/middleware/validate';
import { requireAuth } from '../middleware/auth.middleware';
import { rateLimit } from '../middleware/rate-limit.middleware';
import { AppError } from '../utils/AppError';
import { pool } from '../config/db';
import {
  getUserActivityQuery,
  updateUserPreferencesBody,
  userPreferencesParam,
} from '../schemas/endpointGroups.schemas';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: UserActivity
 *   description: User activity logging and preference management
 */

/**
 * @swagger
 * /api/v1/user-activity:
 *   get:
 *     summary: Get betting and claim activity history
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *           enum: [bet_placed, bet_claimed]
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Paginated user activity log
 *       422:
 *         description: Validation error
 */
router.get(
  '/',
  requireAuth,
  validate(getUserActivityQuery, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as {
        action?: string;
        from?: string;
        to?: string;
        page: number;
        limit: number;
      };

      const userId = (req as Request & { userId?: string }).userId;
      if (!userId) throw new AppError(401, 'Authentication required');
      const { rows: userRows } = await pool.query(
        'SELECT stellar_address FROM users WHERE id = $1',
        [userId],
      );
      const address = userRows[0]?.stellar_address as string | null | undefined;
      const page = query.page;
      const limit = query.limit;
      let activities: unknown[] = [];
      let total = 0;

      if (address) {
        const filters = [address, query.action || null, query.from || null, query.to || null];
        const activityCte = `WITH activity AS (
          SELECT b.id::text || ':placed' AS id, 'bet_placed' AS action, b.placed_at AS timestamp,
               b.market_id, m.fighter_a, m.fighter_b, b.side,
               b.amount / 10000000.0 AS amount_xlm, b.tx_hash
          FROM bets b JOIN markets m ON m.market_id = b.market_id
          WHERE b.bettor_address = $1
          UNION ALL
          SELECT b.id::text || ':claimed' AS id, 'bet_claimed' AS action, b.claimed_at AS timestamp,
               b.market_id, m.fighter_a, m.fighter_b, b.side,
               COALESCE(b.payout, 0) / 10000000.0 AS amount_xlm, b.tx_hash
          FROM bets b JOIN markets m ON m.market_id = b.market_id
          WHERE b.bettor_address = $1 AND b.claimed = TRUE AND b.claimed_at IS NOT NULL
        )`;
        const where = `WHERE ($2::text IS NULL OR action = $2)
          AND ($3::timestamptz IS NULL OR timestamp >= $3)
          AND ($4::timestamptz IS NULL OR timestamp <= $4)`;
        const countResult = await pool.query(
          `${activityCte} SELECT COUNT(*) AS total FROM activity ${where}`,
          filters,
        );
        total = Number(countResult.rows[0]?.total) || 0;
        const result = await pool.query(
          `${activityCte} SELECT * FROM activity ${where}
           ORDER BY timestamp DESC LIMIT $5 OFFSET $6`,
          [...filters, limit, (page - 1) * limit],
        );
        activities = result.rows;
      }

      res.json({
        data: activities,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @swagger
 * /api/v1/user-activity/{userId}/preferences:
 *   put:
 *     summary: Update user preferences
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               emailNotifications:
 *                 type: boolean
 *               pushNotifications:
 *                 type: boolean
 *               marketingEmails:
 *                 type: boolean
 *               defaultCurrency:
 *                 type: string
 *                 enum: [USD, EUR, GBP, XLM]
 *               oddsFormat:
 *                 type: string
 *                 enum: [decimal, fractional, american]
 *               language:
 *                 type: string
 *                 enum: [en, es, fr, de, pt]
 *               timezone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Preferences updated
 *       403:
 *         description: Cannot modify another user's preferences
 *       422:
 *         description: Validation error
 */
router.put(
  '/:userId/preferences',
  requireAuth,
  validate(userPreferencesParam, 'params'),
  validate(updateUserPreferencesBody, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const authUser = (req as any).user;

      if (authUser.id !== userId && authUser.role !== 'admin') {
        throw new AppError(403, 'Cannot modify another user\'s preferences');
      }

      // Placeholder: In production, update user_preferences table
      res.json({
        message: 'Preferences updated successfully',
        userId,
        preferences: req.body,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * @swagger
 * /api/v1/user-activity/{userId}/preferences:
 *   get:
 *     summary: Get user preferences
 *     tags: [UserActivity]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User preferences
 *       403:
 *         description: Cannot view another user's preferences
 */
router.get(
  '/:userId/preferences',
  requireAuth,
  validate(userPreferencesParam, 'params'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const authUser = (req as any).user;

      if (authUser.id !== userId && authUser.role !== 'admin') {
        throw new AppError(403, 'Cannot view another user\'s preferences');
      }

      // Placeholder: In production, fetch from user_preferences table
      res.json({
        userId,
        preferences: {
          emailNotifications: true,
          pushNotifications: true,
          marketingEmails: false,
          defaultCurrency: 'USD',
          oddsFormat: 'decimal',
          language: 'en',
          timezone: 'UTC',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
