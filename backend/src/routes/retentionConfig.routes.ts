// backend/src/routes/retentionConfig.routes.ts
// Data retention configuration endpoints (admin only).
//   GET /api/admin/retention              — list all retention configs
//   GET /api/admin/retention/:dataType    — get a specific config
//   PUT /api/admin/retention/:dataType    — create or update a config

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { AppError } from '../utils/AppError';
import {
  listRetentionConfigs,
  getRetentionConfig,
  upsertRetentionConfig,
} from '../services/retentionConfig.service';

const router = Router();

const upsertRetentionBody = z
  .object({
    retentionDays: z.number().int().min(1).max(3650).optional(),
    enabled: z.boolean().optional(),
    description: z.string().max(500).optional(),
  })
  .refine(
    (d) =>
      d.retentionDays !== undefined ||
      d.enabled !== undefined ||
      d.description !== undefined,
    { message: 'At least one of retentionDays, enabled, or description must be provided' },
  );

/**
 * @swagger
 * /api/admin/retention:
 *   get:
 *     summary: List all data retention configurations (admin only)
 *     description: >
 *       Returns all configured retention policies. These control how long
 *       different categories of data are kept before the cleanup cron removes them.
 *     tags: [Admin, Retention]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of retention configurations
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin access required
 */
router.get('/', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const configs = await listRetentionConfigs();
    res.json({ success: true, data: configs });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/retention/{dataType}:
 *   get:
 *     summary: Get a specific data retention configuration (admin only)
 *     tags: [Admin, Retention]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dataType
 *         required: true
 *         schema:
 *           type: string
 *         example: user_sessions
 *     responses:
 *       200:
 *         description: Retention configuration
 *       404:
 *         description: Configuration not found for the given data type
 */
router.get('/:dataType', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const config = await getRetentionConfig(req.params.dataType);
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/admin/retention/{dataType}:
 *   put:
 *     summary: Create or update a data retention configuration (admin only)
 *     description: >
 *       Uses UPSERT semantics — if no configuration exists for the given
 *       data_type it will be created; otherwise the specified fields are updated.
 *       Only the fields you supply are changed; omitted fields keep their
 *       current values.
 *     tags: [Admin, Retention]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: dataType
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retentionDays:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 3650
 *               enabled:
 *                 type: boolean
 *               description:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       200:
 *         description: Updated retention configuration
 *       400:
 *         description: Validation error
 */
router.put('/:dataType', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const parsed = upsertRetentionBody.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('Validation failed', 'VALIDATION_ERROR', {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const userId = (req as unknown as Record<string, unknown>).userId as
      | string
      | undefined;

    const config = await upsertRetentionConfig(
      req.params.dataType,
      parsed.data,
      userId,
    );
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

export default router;
