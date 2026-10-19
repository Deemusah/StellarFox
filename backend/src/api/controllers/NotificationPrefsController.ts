import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/AppError';

/** Shape of a notification_preferences row */
interface NotificationPrefsRow {
  id: string;
  user_id: string;
  email_notifications: boolean;
  push_notifications: boolean;
  bet_placed: boolean;
  bet_resolved: boolean;
  bet_won: boolean;
  market_locked: boolean;
  achievements: boolean;
  referral_updates: boolean;
  leaderboard_updates: boolean;
  channel: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: Date;
}

const DEFAULT_PREFS = {
  email_notifications: true,
  push_notifications: true,
  bet_placed: true,
  bet_resolved: true,
  bet_won: true,
  market_locked: true,
  achievements: true,
  referral_updates: true,
  leaderboard_updates: false,
  channel: 'email',
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
};

export class NotificationPrefsController {
  /**
   * GET /api/users/notifications/preferences
   * Returns the authenticated user's notification preferences.
   * Falls back to defaults if no row exists yet.
   */
  async getPreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId as string;

      if (!userId) {
        throw new AppError(401, 'Unauthorized');
      }

      const result = await pool.query<NotificationPrefsRow>(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId],
      );

      if (result.rows.length === 0) {
        res.status(200).json({ success: true, data: { ...DEFAULT_PREFS } });
        return;
      }

      const row = result.rows[0];
      res.status(200).json({
        success: true,
        data: {
          email_notifications: row.email_notifications,
          push_notifications: row.push_notifications,
          bet_placed: row.bet_placed,
          bet_resolved: row.bet_resolved,
          bet_won: row.bet_won,
          market_locked: row.market_locked,
          achievements: row.achievements,
          referral_updates: row.referral_updates,
          leaderboard_updates: row.leaderboard_updates,
          channel: row.channel,
          quiet_hours_start: row.quiet_hours_start,
          quiet_hours_end: row.quiet_hours_end,
          updatedAt: row.updated_at,
        },
      });
    } catch (error) {
      logger.error({ error }, 'NotificationPrefsController.getPreferences error');
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PUT /api/users/notifications/preferences
   * Upserts the authenticated user's notification preferences.
   */
  async updatePreferences(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId as string;

      if (!userId) {
        throw new AppError(401, 'Unauthorized');
      }

      const body = req.body as Partial<{
        email_notifications: boolean;
        push_notifications: boolean;
        bet_placed: boolean;
        bet_resolved: boolean;
        bet_won: boolean;
        market_locked: boolean;
        achievements: boolean;
        referral_updates: boolean;
        leaderboard_updates: boolean;
        channel: string;
        quiet_hours_start: string | null;
        quiet_hours_end: string | null;
      }>;

      const result = await pool.query<NotificationPrefsRow>(
        `INSERT INTO notification_preferences (
           user_id,
           email_notifications, push_notifications,
           bet_placed, bet_resolved, bet_won,
           market_locked, achievements, referral_updates, leaderboard_updates,
           channel, quiet_hours_start, quiet_hours_end,
           updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           email_notifications  = COALESCE(EXCLUDED.email_notifications,  notification_preferences.email_notifications),
           push_notifications   = COALESCE(EXCLUDED.push_notifications,   notification_preferences.push_notifications),
           bet_placed           = COALESCE(EXCLUDED.bet_placed,           notification_preferences.bet_placed),
           bet_resolved         = COALESCE(EXCLUDED.bet_resolved,         notification_preferences.bet_resolved),
           bet_won              = COALESCE(EXCLUDED.bet_won,              notification_preferences.bet_won),
           market_locked        = COALESCE(EXCLUDED.market_locked,        notification_preferences.market_locked),
           achievements         = COALESCE(EXCLUDED.achievements,         notification_preferences.achievements),
           referral_updates     = COALESCE(EXCLUDED.referral_updates,     notification_preferences.referral_updates),
           leaderboard_updates  = COALESCE(EXCLUDED.leaderboard_updates,  notification_preferences.leaderboard_updates),
           channel              = COALESCE(EXCLUDED.channel,              notification_preferences.channel),
           quiet_hours_start    = EXCLUDED.quiet_hours_start,
           quiet_hours_end      = EXCLUDED.quiet_hours_end,
           updated_at           = NOW()
         RETURNING *`,
        [
          userId,
          body.email_notifications ?? null,
          body.push_notifications ?? null,
          body.bet_placed ?? null,
          body.bet_resolved ?? null,
          body.bet_won ?? null,
          body.market_locked ?? null,
          body.achievements ?? null,
          body.referral_updates ?? null,
          body.leaderboard_updates ?? null,
          body.channel ?? null,
          body.quiet_hours_start !== undefined ? body.quiet_hours_start : null,
          body.quiet_hours_end !== undefined ? body.quiet_hours_end : null,
        ],
      );

      const row = result.rows[0];
      res.status(200).json({
        success: true,
        data: {
          email_notifications: row.email_notifications,
          push_notifications: row.push_notifications,
          bet_placed: row.bet_placed,
          bet_resolved: row.bet_resolved,
          bet_won: row.bet_won,
          market_locked: row.market_locked,
          achievements: row.achievements,
          referral_updates: row.referral_updates,
          leaderboard_updates: row.leaderboard_updates,
          channel: row.channel,
          quiet_hours_start: row.quiet_hours_start,
          quiet_hours_end: row.quiet_hours_end,
          updatedAt: row.updated_at,
        },
      });
    } catch (error) {
      logger.error({ error }, 'NotificationPrefsController.updatePreferences error');
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export const notificationPrefsController = new NotificationPrefsController();
