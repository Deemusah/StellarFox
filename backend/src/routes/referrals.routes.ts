// ============================================================
// BANKERCHANGER — Referral Routes
// POST /api/referrals         — register a referral
// GET  /api/referrals/stats   — authenticated user's referral stats
// GET  /api/referrals         — list all referrals made by authenticated user
// ============================================================

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { validateBody } from '../api/middleware/validate';
import { referralController } from '../api/controllers/ReferralController';
import { createReferralBody } from '../schemas/referral.schemas';

const router = Router();

/**
 * @swagger
 * /api/referrals:
 *   post:
 *     summary: Register a referral using a referral code
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - referral_code
 *             properties:
 *               referral_code:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 description: The referral code belonging to the referrer
 *     responses:
 *       201:
 *         description: Referral created successfully
 *       400:
 *         description: Validation error or self-referral attempt
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Referral code not found
 *       409:
 *         description: User has already been referred
 */
router.post(
  '/',
  requireAuth,
  validateBody(createReferralBody),
  (req, res, next) => {
    referralController.createReferral(req, res).catch(next);
  },
);

/**
 * @swagger
 * /api/referrals/stats:
 *   get:
 *     summary: Get referral statistics for the authenticated user
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Referral stats and user's own referral code
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
 *                     total_referrals:
 *                       type: integer
 *                     active_referrals:
 *                       type: integer
 *                     converted_referrals:
 *                       type: integer
 *                     total_earnings:
 *                       type: string
 *                     my_referral_code:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/stats',
  requireAuth,
  (req, res, next) => {
    referralController.getReferralStats(req, res).catch(next);
  },
);

/**
 * @swagger
 * /api/referrals:
 *   get:
 *     summary: List all referrals made by the authenticated user
 *     tags: [Referrals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of referrals
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/',
  requireAuth,
  (req, res, next) => {
    referralController.getMyReferrals(req, res).catch(next);
  },
);

export default router;
