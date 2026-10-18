import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import * as MarketService from '../services/MarketService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Batch
 *   description: Bulk operation endpoints for efficient multi-request processing
 */

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const MAX_BATCH_SIZE = 50;

const batchMarketsBodySchema = z.object({
  marketIds: z
    .array(z.string().min(1))
    .min(1, 'At least one market ID is required')
    .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} market IDs per batch`),
});

const batchMarketOddsBodySchema = z.object({
  marketIds: z
    .array(z.string().min(1))
    .min(1, 'At least one market ID is required')
    .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} market IDs per batch`),
});

const batchMarketStatsBodySchema = z.object({
  marketIds: z
    .array(z.string().min(1))
    .min(1, 'At least one market ID is required')
    .max(MAX_BATCH_SIZE, `Maximum ${MAX_BATCH_SIZE} market IDs per batch`),
});

// ---------------------------------------------------------------------------
// Helper — execute an array of async operations and collect results with
// per-item error isolation so one failure does not abort the whole batch.
// ---------------------------------------------------------------------------
type BatchItem<T> =
  | { id: string; status: 'fulfilled'; data: T }
  | { id: string; status: 'rejected'; error: { message: string; code?: string } };

async function runBatch<T>(
  ids: string[],
  fn: (id: string) => Promise<T>,
): Promise<BatchItem<T>[]> {
  const results = await Promise.allSettled(ids.map((id) => fn(id)));
  return results.map((result, i) => {
    const id = ids[i]!;
    if (result.status === 'fulfilled') {
      return { id, status: 'fulfilled', data: result.value };
    }
    const err = result.reason;
    return {
      id,
      status: 'rejected',
      error: {
        message: err instanceof AppError ? err.message : 'Internal error',
        ...(err instanceof AppError && err.code ? { code: err.code } : {}),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// POST /api/batch/markets — fetch multiple markets by ID
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/batch/markets:
 *   post:
 *     summary: Fetch multiple markets by ID in a single request
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketIds]
 *             properties:
 *               marketIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 50
 *                 description: List of market IDs to fetch (max 50)
 *     responses:
 *       200:
 *         description: Per-item results. Each item is either fulfilled (with data) or rejected (with error).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     oneOf:
 *                       - type: object
 *                         properties:
 *                           id: { type: string }
 *                           status: { type: string, enum: [fulfilled] }
 *                           data: { type: object }
 *                       - type: object
 *                         properties:
 *                           id: { type: string }
 *                           status: { type: string, enum: [rejected] }
 *                           error: { type: object }
 *                 total: { type: integer }
 *                 succeeded: { type: integer }
 *                 failed: { type: integer }
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/markets',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = batchMarketsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
        res.status(400).json({ errors });
        return;
      }

      const { marketIds } = parsed.data;
      logger.info({ count: marketIds.length }, 'Batch markets request');

      const results = await runBatch(marketIds, (id) => MarketService.getMarketById(id));

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      res.json({ results, total: results.length, succeeded, failed });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/batch/markets/odds — fetch odds for multiple markets
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/batch/markets/odds:
 *   post:
 *     summary: Fetch odds for multiple markets in a single request
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketIds]
 *             properties:
 *               marketIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 50
 *     responses:
 *       200:
 *         description: Per-item odds results
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/markets/odds',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = batchMarketOddsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
        res.status(400).json({ errors });
        return;
      }

      const { marketIds } = parsed.data;
      logger.info({ count: marketIds.length }, 'Batch market odds request');

      const results = await runBatch(marketIds, (id) =>
        MarketService.calculateOutcomeOdds(id),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      res.json({ results, total: results.length, succeeded, failed });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/batch/markets/stats — fetch stats for multiple markets
// ---------------------------------------------------------------------------

/**
 * @swagger
 * /api/batch/markets/stats:
 *   post:
 *     summary: Fetch statistics for multiple markets in a single request
 *     tags: [Batch]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [marketIds]
 *             properties:
 *               marketIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 minItems: 1
 *                 maxItems: 50
 *     responses:
 *       200:
 *         description: Per-item stats results
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/markets/stats',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = batchMarketStatsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        const errors = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
        res.status(400).json({ errors });
        return;
      }

      const { marketIds } = parsed.data;
      logger.info({ count: marketIds.length }, 'Batch market stats request');

      const results = await runBatch(marketIds, (id) =>
        MarketService.getMarketStats(id),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.length - succeeded;

      res.json({ results, total: results.length, succeeded, failed });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
