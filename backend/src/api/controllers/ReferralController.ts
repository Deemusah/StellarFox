// ============================================================
// BANKERCHANGER — Referral Controller
// Handles referral creation, stats, and listing.
// ============================================================

import type { Request, Response } from 'express';
import { pool } from '../../config/db';
import { AppError } from '../../utils/AppError';

export class ReferralController {
  /**
   * POST /api/referrals
   * Authenticated. Registers the calling user as referred by the owner of
   * the supplied referral_code.
   *
   * Flow:
   *   1. Look up the referrer by referral_code.
   *   2. Prevent self-referral.
   *   3. Insert into referrals with status = 'pending'.
   *   4. Handle unique constraint on referred_id (each user can only be
   *      referred once) by returning 409 Conflict.
   */
  async createReferral(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId as string;
    const { referral_code } = req.body as { referral_code: string };

    // 1. Look up the referrer by referral_code
    const referrerResult = await pool.query<{ id: string }>(
      'SELECT id FROM users WHERE referral_code = $1',
      [referral_code],
    );

    if (referrerResult.rowCount === 0) {
      throw new AppError(404, 'Referral code not found');
    }

    const referrerId = referrerResult.rows[0].id;

    // 2. Prevent self-referral
    if (referrerId === userId) {
      throw new AppError(400, 'You cannot refer yourself');
    }

    // 3. Insert referral record — handle unique constraint on referred_id (23505)
    try {
      const insertResult = await pool.query(
        `INSERT INTO referrals (referrer_id, referred_id, referral_code, status, created_at)
         VALUES ($1, $2, $3, 'pending', NOW())
         RETURNING *`,
        [referrerId, userId, referral_code],
      );

      res.status(201).json({
        success: true,
        data: insertResult.rows[0],
      });
    } catch (err: any) {
      // 4. PostgreSQL unique violation — each user can only be referred once
      if (err?.code === '23505') {
        throw new AppError(409, 'You have already been referred');
      }
      throw err;
    }
  }

  /**
   * GET /api/referrals/stats
   * Authenticated. Returns aggregate referral stats for the calling user
   * plus their own referral_code so they can share it.
   */
  async getReferralStats(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId as string;

    // Aggregate referral stats joined with payout totals
    const statsResult = await pool.query<{
      total_referrals: string;
      active_referrals: string;
      converted_referrals: string;
      total_earnings: string;
    }>(
      `SELECT
        COUNT(*) AS total_referrals,
        COUNT(CASE WHEN r.status = 'active'    THEN 1 END) AS active_referrals,
        COUNT(CASE WHEN r.status = 'converted' THEN 1 END) AS converted_referrals,
        COALESCE(SUM(rp.payout_amount), 0)                 AS total_earnings
       FROM referrals r
       LEFT JOIN referral_payouts rp ON rp.referrer_id = r.referrer_id
       WHERE r.referrer_id = $1`,
      [userId],
    );

    // Fetch the caller's own referral code
    const codeResult = await pool.query<{ referral_code: string | null }>(
      'SELECT referral_code FROM users WHERE id = $1',
      [userId],
    );

    const stats = statsResult.rows[0];
    const myReferralCode = codeResult.rows[0]?.referral_code ?? null;

    res.status(200).json({
      success: true,
      data: {
        total_referrals: Number(stats.total_referrals),
        active_referrals: Number(stats.active_referrals),
        converted_referrals: Number(stats.converted_referrals),
        total_earnings: stats.total_earnings,
        my_referral_code: myReferralCode,
      },
    });
  }

  /**
   * GET /api/referrals
   * Authenticated. Returns all referrals the calling user has made
   * (i.e. where referrer_id = userId).
   */
  async getMyReferrals(req: Request, res: Response): Promise<void> {
    const userId = (req as any).userId as string;

    const result = await pool.query(
      `SELECT *
       FROM referrals
       WHERE referrer_id = $1
       ORDER BY created_at DESC`,
      [userId],
    );

    res.status(200).json({
      success: true,
      data: result.rows,
      total: result.rowCount,
    });
  }
}

export const referralController = new ReferralController();
