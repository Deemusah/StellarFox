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
    { message: 'At least one field must be provided' },
  );

/**
 * GET /api/admin/retention — list all retention configs. Admin only.
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
 * GET /api/admin/retention/:dataType — get a specific config. Admin only.
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
 * PUT /api/admin/retention/:dataType — update a retention config. Admin only.
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
    const userId = (req as unknown as Record<string, unknown>).userId as string | undefined;
    const config = await upsertRetentionConfig(req.params.dataType, parsed.data, userId);
    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
});

export default router;
