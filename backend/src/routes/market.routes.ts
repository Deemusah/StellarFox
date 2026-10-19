import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
    listMarkets,
    listMarketsValidation,
    getMarket,
    getMarketBets,
    getMarketBetsValidation,
    getMarketOdds,
    streamMarketOdds,
    getMarketStats,
    getMarketAnalytics,
    getMarketRecommendations,
    getPlatformStats,
    resolveMarket,
    simulatePayout,
    simulatePayoutValidation,
    searchSuggestions,
} from '../api/controllers/MarketController';
import { requireAdminJwt } from '../middleware/requireAdminJwt.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import {
    cacheMarket,
    cacheMarketList,
    cacheMarketStats,
    cacheMiddleware,
} from '../middleware/cache.middleware';
import { invalidateMarket } from '../services/cache-invalidation.service';

const router = Router();

/**
 * Inline route handler that invalidates market cache after a resolve operation.
 * Runs after resolveMarket has already sent the response.
 */
async function invalidateMarketAfterResolve(
    req: Request,
    _res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        await invalidateMarket(req.params.market_id);
    } catch (err) {
        // Non-fatal: log and continue — response was already sent by resolveMarket
        next(err);
        return;
    }
    next();
}

/**
 * @swagger
 * tags:
 *   name: Markets
 *   description: Prediction market endpoints
 */

/**
 * @swagger
 * /markets/search/suggestions:
 *   get:
 *     summary: Fighter name autocomplete suggestions
 *     tags: [Markets]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Partial fighter name to search for
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 8
 *           minimum: 1
 *           maximum: 20
 *     responses:
 *       200:
 *         description: Matching fighter name suggestions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 suggestions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       market_id:
 *                         type: string
 *                       side:
 *                         type: string
 *                         enum: [a, b]
 *       400:
 *         description: Invalid query parameters
 */
// NOTE: this must be registered before /:market_id to avoid shadowing
router.get('/search/suggestions', searchSuggestions);

/**
 * @swagger
 * tags:
 *   name: Markets
 *   description: Prediction market endpoints
 */

/**
 * @swagger
 * /markets:
 *   get:
 *     summary: List all markets (paginated)
 *     tags: [Markets]
 *     parameters:
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
 *           maximum: 200
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [OPEN, LOCKED, RESOLVED, CANCELLED]
 *       - in: query
 *         name: category
 *         description: Filter by a category or the COMBAT_SPORTS parent category.
 *         schema:
 *           type: string
 *           enum: [BOXING, MMA, KICKBOXING, OTHER, COMBAT_SPORTS]
 *     responses:
 *       200:
 *         description: Paginated list of markets
 *       400:
 *         description: Invalid parameters (limit exceeds maximum of 200)
 */
router.get('/', listMarketsValidation, cacheMarketList(10), listMarkets);

/**
 * @swagger
 * /markets/stats:
 *   get:
 *     summary: Get aggregated market statistics
 *     tags: [Markets]
 *     responses:
 *       200:
 *         description: Platform-wide market, volume, bettor, and category statistics
 */
router.get('/stats', getMarketAnalytics);

/**
 * @swagger
 * /markets/recommendations:
 *   get:
 *     summary: Get personalized open-market recommendations
 *     tags: [Markets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *     responses:
 *       200:
 *         description: Ranked open markets based on betting history and popularity
 *       401:
 *         description: Unauthorized
 */
router.get('/recommendations', requireAuth, getMarketRecommendations);

/**
 * @swagger
 * /markets/{market_id}:
 *   get:
 *     summary: Get a single market by ID
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Market details
 *       404:
 *         description: Market not found
 */
router.get('/:market_id', cacheMarket(30), getMarket);

/**
 * @swagger
 * /markets/{market_id}/bets:
 *   get:
 *     summary: List bets for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
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
 *     responses:
 *       200:
 *         description: Paginated list of bets
 */
router.get('/:market_id/bets', getMarketBetsValidation, getMarketBets);

/**
 * @swagger
 * /markets/{market_id}/odds/stream:
 *   get:
 *     summary: Server-Sent Events stream of live odds for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: SSE stream — pushes odds on connect then every 5 s; closes when market is terminal
 */
router.get('/:market_id/odds/stream', streamMarketOdds);

/**
 * @swagger
 * /markets/{market_id}/odds:
 *   get:
 *     summary: Get current odds for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current odds
 */
router.get(
    '/:market_id/odds',
    cacheMiddleware((req) => `market:${req.params.market_id}:odds`, 5),
    getMarketOdds,
);

/**
 * @swagger
 * /markets/{market_id}/stats:
 *   get:
 *     summary: Get statistics for a market
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Market statistics
 */
router.get('/:market_id/stats', cacheMarketStats(60), getMarketStats);

/**
 * @swagger
 * /markets/{market_id}/simulate:
 *   get:
 *     summary: Simulate payout for a given bet amount and outcome
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: number
 *       - in: query
 *         name: outcome
 *         required: true
 *         schema:
 *           type: integer
 *           enum: [0, 1]
 *     responses:
 *       200:
 *         description: Simulated payout details
 */
router.get('/:market_id/simulate', simulatePayoutValidation, simulatePayout);

/**
 * @swagger
 * /markets/{market_id}/resolve:
 *   post:
 *     summary: Resolve a market (admin only)
 *     tags: [Markets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: market_id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [winningOutcome]
 *             properties:
 *               winningOutcome:
 *                 type: integer
 *                 enum: [0, 1]
 *     responses:
 *       200:
 *         description: Market resolved
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Market not found
 */
router.post('/:market_id/resolve', requireAdminJwt, resolveMarket, invalidateMarketAfterResolve);

export default router;
