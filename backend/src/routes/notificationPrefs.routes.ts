import { Router } from 'express';
import { z } from 'zod';
import { notificationPrefsController } from '../api/controllers/NotificationPrefsController';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../api/middleware/validate';

const router = Router();

/**
 * Inline Zod schema for updating notification preferences.
 * All fields are optional so callers can patch individual settings.
 */
const updatePrefsBody = z
  .object({
    email_notifications: z.boolean().optional(),
    push_notifications: z.boolean().optional(),
    bet_placed: z.boolean().optional(),
    bet_resolved: z.boolean().optional(),
    bet_won: z.boolean().optional(),
    market_locked: z.boolean().optional(),
    achievements: z.boolean().optional(),
    referral_updates: z.boolean().optional(),
    leaderboard_updates: z.boolean().optional(),
    channel: z
      .enum(['email', 'push', 'both', 'none'])
      .optional(),
    quiet_hours_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'quiet_hours_start must be in HH:MM format')
      .nullable()
      .optional(),
    quiet_hours_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'quiet_hours_end must be in HH:MM format')
      .nullable()
      .optional(),
  })
  .refine(
    (d) => Object.values(d).some((v) => v !== undefined),
    { message: 'At least one preference field must be provided' },
  );

/**
 * @swagger
 * /api/users/notifications/preferences:
 *   get:
 *     summary: Get the authenticated user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preferences
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/notifications/preferences',
  requireAuth,
  notificationPrefsController.getPreferences.bind(notificationPrefsController),
);

/**
 * @swagger
 * /api/users/notifications/preferences:
 *   put:
 *     summary: Create or update the authenticated user's notification preferences
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email_notifications:
 *                 type: boolean
 *               push_notifications:
 *                 type: boolean
 *               bet_placed:
 *                 type: boolean
 *               bet_resolved:
 *                 type: boolean
 *               bet_won:
 *                 type: boolean
 *               market_locked:
 *                 type: boolean
 *               achievements:
 *                 type: boolean
 *               referral_updates:
 *                 type: boolean
 *               leaderboard_updates:
 *                 type: boolean
 *               channel:
 *                 type: string
 *                 enum: [email, push, both, none]
 *               quiet_hours_start:
 *                 type: string
 *                 nullable: true
 *                 pattern: '^\d{2}:\d{2}$'
 *               quiet_hours_end:
 *                 type: string
 *                 nullable: true
 *                 pattern: '^\d{2}:\d{2}$'
 *     responses:
 *       200:
 *         description: Updated notification preferences
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Validation error
 */
router.put(
  '/notifications/preferences',
  requireAuth,
  validate(updatePrefsBody, 'body'),
  notificationPrefsController.updatePreferences.bind(notificationPrefsController),
);

export default router;
