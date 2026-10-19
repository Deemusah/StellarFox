import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import {
  addToWatchlist,
  removeFromWatchlist,
  getWatchlist,
  isWatchlisted,
} from '../services/watchlist.service';

const router = Router();

function getUserId(req: Request): string {
  const userId = (req as unknown as Record<string, unknown>).userId as string | undefined;
  if (!userId) throw AppError.unauthorized('Authentication required');
  return userId;
}

/**
 * GET /api/watchlist — get the authenticated user's watchlist
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
 * POST /api/watchlist/:marketId — add market to watchlist
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
 * DELETE /api/watchlist/:marketId — remove market from watchlist
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
 * GET /api/watchlist/:marketId/status — check if market is watchlisted
 */
router.get('/:marketId/status', requireAuth, async (req, res, next) => {
  try {
    const { marketId } = req.params;
    const watchlisted = await isWatchlisted(getUserId(req), marketId);
    res.json({ success: true, data: { watchlisted } });
  } catch (err) {
    next(err);
  }
});

export default router;
