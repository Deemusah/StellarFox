// backend/src/routes/feedback.routes.ts
// Feedback collection endpoints.
//   POST /api/feedback         — submit feedback (auth optional, open to anonymous users)
//   GET  /api/feedback         — list all feedback entries (admin only)

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { AppError } from '../utils/AppError';
import { submitFeedback, listFeedback, countFeedback } from '../services/feedback.service';
import { submitFeedbackBody } from '../schemas/validation.schemas';

const router = Router();

/**
 * @swagger
 * /api/feedback:
 *   post:
 *     summary: Submit user feedback
 *     description: >
 *       Collects a feedback entry from a user. Authentication is optional —
 *       anonymous submissions are accepted so we capture feedback from visitors
 *       who haven't signed up.
 *     tags: [Feedback]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, message]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [general, feature_request, ux, performance, other]
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               message:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 2000
 *               pageUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Feedback submitted successfully
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = submitFeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('Validation failed', 'VALIDATION_ERROR', {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    // Auth is optional — attach userId only if authenticated
    const userId = (req as unknown as Record<string, unknown>).userId as
      | string
      | undefined;

    const { category, rating, message, pageUrl } = parsed.data;
    const feedback = await submitFeedback({
      userId,
      category,
      rating,
      message,
      pageUrl,
    });

    res.status(201).json({ success: true, data: { id: feedback.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/feedback:
 *   get:
 *     summary: List feedback entries (admin only)
 *     tags: [Feedback]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: List of feedback entries
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — admin access required
 */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const category =
      typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = req.query.limit
      ? Math.min(parseInt(req.query.limit as string, 10), 200)
      : 50;
    const offset = req.query.offset
      ? parseInt(req.query.offset as string, 10)
      : 0;

    const [items, total] = await Promise.all([
      listFeedback({ category, limit, offset }),
      countFeedback(category),
    ]);

    res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) {
    next(err);
  }
});

export default router;
