import { Request, Response } from 'express';
import { pool } from '../../config/db';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/AppError';

export class ProfileController {
  /**
   * GET /api/users/profile
   * Returns the authenticated user's extended profile.
   * Falls back to empty defaults if the profile row does not exist yet.
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId as string;

      if (!userId) {
        throw new AppError(401, 'Unauthorized');
      }

      const result = await pool.query<{
        id: string;
        display_name: string | null;
        bio: string | null;
        avatar_url: string | null;
        social_links: Record<string, string> | null;
        created_at: Date;
      }>(
        `SELECT id, display_name, bio, avatar_url, social_links, created_at
         FROM user_profiles
         WHERE user_id = $1`,
        [userId],
      );

      if (result.rows.length === 0) {
        // Profile row hasn't been created yet — return sensible defaults
        res.status(200).json({
          success: true,
          data: {
            id: null,
            displayName: null,
            bio: null,
            avatarUrl: null,
            socialLinks: {
              twitter: '',
              instagram: '',
              website: '',
            },
            createdAt: null,
          },
        });
        return;
      }

      const row = result.rows[0];
      res.status(200).json({
        success: true,
        data: {
          id: row.id,
          displayName: row.display_name,
          bio: row.bio,
          avatarUrl: row.avatar_url,
          socialLinks: row.social_links ?? { twitter: '', instagram: '', website: '' },
          createdAt: row.created_at,
        },
      });
    } catch (error) {
      logger.error({ error }, 'ProfileController.getProfile error');
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PUT /api/users/profile
   * Upserts the authenticated user's extended profile.
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId as string;

      if (!userId) {
        throw new AppError(401, 'Unauthorized');
      }

      const { displayName, bio, avatarUrl, socialLinks } = req.body as {
        displayName?: string;
        bio?: string;
        avatarUrl?: string;
        socialLinks?: { twitter?: string; instagram?: string; website?: string };
      };

      const result = await pool.query<{
        id: string;
        display_name: string | null;
        bio: string | null;
        avatar_url: string | null;
        social_links: Record<string, string> | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `INSERT INTO user_profiles (user_id, display_name, bio, avatar_url, social_links, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = COALESCE(EXCLUDED.display_name, user_profiles.display_name),
           bio          = COALESCE(EXCLUDED.bio,          user_profiles.bio),
           avatar_url   = COALESCE(EXCLUDED.avatar_url,   user_profiles.avatar_url),
           social_links = COALESCE(EXCLUDED.social_links, user_profiles.social_links),
           updated_at   = NOW()
         RETURNING id, display_name, bio, avatar_url, social_links, created_at, updated_at`,
        [
          userId,
          displayName ?? null,
          bio ?? null,
          avatarUrl ?? null,
          socialLinks !== undefined ? JSON.stringify(socialLinks) : null,
        ],
      );

      const row = result.rows[0];
      res.status(200).json({
        success: true,
        data: {
          id: row.id,
          displayName: row.display_name,
          bio: row.bio,
          avatarUrl: row.avatar_url,
          socialLinks: row.social_links ?? { twitter: '', instagram: '', website: '' },
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (error) {
      logger.error({ error }, 'ProfileController.updateProfile error');
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, message: error.message });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export const profileController = new ProfileController();
