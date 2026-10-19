// backend/src/api/controllers/disputes.controller.ts - Disputes Controller
import { Response } from 'express';
import { pool } from '../../config/db';
import { AuthenticatedRequest } from '../../types/auth.types';
import { logger } from '../../utils/logger';

const COOLDOWN_HOURS = 24;

class DisputesController {

  async submitDispute(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      const { marketId, reason, evidenceUrl } = req.body;

      const cooldownCheck = await pool.query(
        `SELECT id FROM disputes
         WHERE user_id = $1 AND market_id = $2
         AND raised_at > NOW() - INTERVAL '${COOLDOWN_HOURS} hours'
         LIMIT 1`,
        [userId, marketId],
      );

      if (cooldownCheck.rows.length > 0) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'DISPUTE_COOLDOWN',
            message: `You can only submit one dispute per market every ${COOLDOWN_HOURS} hours`,
          },
        });
      }

      const existingActive = await pool.query(
        `SELECT id FROM disputes WHERE market_id = $1 AND status IN ('open', 'reviewing') LIMIT 1`,
        [marketId],
      );

      if (existingActive.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'ACTIVE_DISPUTE_EXISTS',
            message: 'An active dispute already exists for this market',
          },
        });
      }

      const result = await pool.query(
        `INSERT INTO disputes (market_id, user_id, reason, evidence_url, status, raised_at)
         VALUES ($1, $2, $3, $4, 'open', NOW())
         RETURNING *`,
        [marketId, userId, reason, evidenceUrl || null],
      );

      return res.status(201).json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.submitDispute');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async listDisputes(req: AuthenticatedRequest, res: Response) {
    try {
      const status = req.query.status as string | undefined;
      const marketId = req.query.marketId as string | undefined;
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const offset = (page - 1) * limit;

      let query = `SELECT * FROM disputes WHERE 1=1`;
      const params: unknown[] = [];
      let paramIndex = 1;

      if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
      }
      if (marketId) {
        query += ` AND market_id = $${paramIndex++}`;
        params.push(marketId);
      }

      const countResult = await pool.query(
        query.replace('SELECT *', 'SELECT COUNT(*)'),
        params,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      query += ` ORDER BY raised_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      return res.status(200).json({
        success: true,
        data: {
          disputes: result.rows,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1,
          },
        },
      });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.listDisputes');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getDispute(req: AuthenticatedRequest, res: Response) {
    try {
      const { disputeId } = req.params;
      const result = await pool.query(
        `SELECT d.id, d.market_id, d.reason, d.evidence_url, d.status, d.final_outcome,
                d.raised_at, d.reviewed_at, d.resolved_at,
                m.match_id, m.fighter_a, m.fighter_b, m.outcome AS market_outcome
         FROM disputes d JOIN markets m ON m.market_id = d.market_id
         WHERE d.id = $1`,
        [disputeId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Dispute not found' });
      }

      const dispute = result.rows[0];
      const history = [
        { status: 'open', at: dispute.raised_at },
        dispute.reviewed_at && { status: 'reviewing', at: dispute.reviewed_at },
        dispute.resolved_at && { status: dispute.status, at: dispute.resolved_at },
      ].filter(Boolean);

      return res.status(200).json({ success: true, data: { ...dispute, history } });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.getDispute');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async listMyDisputes(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.userId || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
      const offset = (page - 1) * limit;
      const [countResult, result] = await Promise.all([
        pool.query('SELECT COUNT(*) AS total FROM disputes WHERE user_id = $1', [userId]),
        pool.query(
          `SELECT d.id, d.market_id, d.reason, d.evidence_url, d.status, d.final_outcome,
                  d.raised_at, d.reviewed_at, d.resolved_at,
                  m.match_id, m.fighter_a, m.fighter_b, m.outcome AS market_outcome
           FROM disputes d JOIN markets m ON m.market_id = d.market_id
           WHERE d.user_id = $1 ORDER BY d.raised_at DESC LIMIT $2 OFFSET $3`,
          [userId, limit, offset],
        ),
      ]);
      const total = Number(countResult.rows[0]?.total) || 0;

      return res.status(200).json({
        success: true,
        data: {
          disputes: result.rows,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        },
      });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.listMyDisputes');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async reviewDispute(req: AuthenticatedRequest, res: Response) {
    try {
      const { disputeId } = req.params;
      const { adminNotes } = req.body;

      const result = await pool.query(
        `UPDATE disputes
         SET status = 'reviewing', admin_notes = $1, reviewed_at = NOW()
         WHERE id = $2 AND status = 'open'
         RETURNING *`,
        [adminNotes, disputeId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Dispute not found or already reviewed' });
      }

      return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.reviewDispute');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async resolveDispute(req: AuthenticatedRequest, res: Response) {
    try {
      const { disputeId } = req.params;
      const { action, resolution, adminNotes, newWinningOutcome } = req.body;

      const status = action === 'DISMISS' ? 'dismissed' : 'resolved';

      const result = await pool.query(
        `UPDATE disputes
         SET status = $1, final_outcome = $2, admin_notes = COALESCE($3, admin_notes), resolved_at = NOW()
         WHERE id = $4 AND status = 'reviewing'
         RETURNING *`,
        [status, resolution, adminNotes || null, disputeId],
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Dispute not found or not in reviewing status' });
      }

      return res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error) {
      logger.error(error instanceof Error ? error : new Error(String(error)), 'DisputesController.resolveDispute');
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export const disputesController = new DisputesController();
