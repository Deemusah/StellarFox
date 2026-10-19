// backend/src/routes/watchlist.routes.ts
// Market watchlist endpoints (all require authentication).
//   GET    /api/watchlist               — get the user's watchlist
//   POST   /api/watchlist/:marketId     — add a market to watchlist
//   DELETE /api/watchlist/:marketId     — remove a market from watchlist
//   GET    /api/watchlist/:marketId/status — check if a market is watchlisted

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  isWatchlisted,
} from '../services/watchlist.service';

const router = Router();

function getUserId(req: import('express').Request): string {
  const userId = (req as unknown as Record<string, unknown>).userId as
    | string
    | undefined;
  if (!userId) throw AppError.unauthorized('Authentication required');
  return userId;
}

/**
 * @swagger
 * /api/watchlist:
 *   get:
 *     summary: Get the authenticated user's market watchlist
 *     tags: [Watchlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Array of watchlisted markets with basic details
 *       401:
 *         description: Unauthorized
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const entries = await getWatchlist(getUserId(req));
    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/watchlist/{marketId}:
 *   post:
 *     summary: Add a market to the watchlist
 *     tags: [Watchlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       201:
 *         description: Market added to watchlist
 *       404:
 *         description: Market not found
 *       409:
 *         description: Market already in watchlist
 */
router.post('/:marketId', requireAuth, async (req, res, next) => {
  try {
    const { marketId } = req.params;
    if (!marketId) throw AppError.badRequest('marketId is required');
    const entry = await addToWatchlist(getUserId(req), marketId);
    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/watchlist/{marketId}:
 *   delete:
 *     summary: Remove a market from the watchlist
 *     tags: [Watchlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Market removed from watchlist
 *       404:
 *         description: Watchlist entry not found
 */
router.delete('/:marketId', requireAuth, async (req, res, next) => {
  try {
    const { marketId } = req.params;
    if (!marketId) throw AppError.badRequest('marketId is required');
    await removeFromWatchlist(getUserId(req), marketId);
    res.json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/watchlist/{marketId}/status:
 *   get:
 *     summary: Check if a specific market is in the user's watchlist
 *     tags: [Watchlist]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: marketId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Watchlist status
 */
router.get('/:marketId/status', requireAuth, async (req, res, next) => {
  try {
    const { marketId } = req.params;
    if (!marketId) throw AppError.badRequest('marketId is required');
    const watchlisted = await isWatchlisted(getUserId(req), marketId);
    res.json({ success: true, data: { watchlisted } });
  } catch (err) {
    next(err);
  }
});

export default router;
