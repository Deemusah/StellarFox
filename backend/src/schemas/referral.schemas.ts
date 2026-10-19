// ============================================================
// BANKERCHANGER — Referral Schemas
// Zod validation schemas for referral endpoints.
// ============================================================

import { z } from 'zod';

/**
 * Body schema for POST /api/referrals
 * The referral_code is the code belonging to the referrer.
 */
export const createReferralBody = z.object({
  referral_code: z.string().min(3).max(50),
});

/**
 * Params schema for GET /api/referrals/stats
 * Stats are derived from the authenticated user — no extra params needed.
 */
export const getReferralStatsParams = z.object({}); // stats are for the authenticated user

export type CreateReferralBody = z.infer<typeof createReferralBody>;
export type GetReferralStatsParams = z.infer<typeof getReferralStatsParams>;
