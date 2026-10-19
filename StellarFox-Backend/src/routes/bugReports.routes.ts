// backend/src/routes/bugReports.routes.ts
// Bug report endpoints.
//   POST /api/bug-reports                      — submit a bug report (auth optional)
//   GET  /api/bug-reports                      — list all reports (admin only)
//   PATCH /api/bug-reports/:id/status          — update report status (admin only)

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import { AppError } from '../utils/AppError';
import {
  submitBugReport,
  listBugReports,
  updateBugReportStatus,
} from '../services/bugReport.service';
import { submitBugReportBody } from '../schemas/validation.schemas';
import { z } from 'zod';

const router = Router();

const updateStatusBody = z.object({
  status: z.enum(['open', 'investigating', 'resolved', 'closed'], {
    errorMap: () => ({
      message: 'status must be one of: open, investigating, resolved, closed',
    }),
  }),
});

/**
 * @swagger
 * /api/bug-reports:
 *   post:
 *     summary: Submit a bug report
 *     description: >
 *       Accepts a structured bug report from a user. Authentication is optional —
 *       anonymous reports are accepted to lower the barrier for issue reporting.
 *     tags: [Bug Reports]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description]
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 5
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 5000
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *                 default: medium
 *               category:
 *                 type: string
 *                 enum: [ui, transaction, wallet, market, general]
 *                 default: general
 *               stepsToReproduce:
 *                 type: string
 *               expectedBehavior:
 *                 type: string
 *               actualBehavior:
 *                 type: string
 *               pageUrl:
 *                 type: string
 *                 format: uri
 *               browserInfo:
 *                 type: object
 *     responses:
 *       201:
 *         description: Bug report submitted successfully
 *       400:
 *         description: Validation error
 */
router.post('/', async (req, res, next) => {
  try {
    const parsed = submitBugReportBody.safeParse(req.body);
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

    const {
      title,
      description,
      severity,
      category,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      pageUrl,
      browserInfo,
    } = parsed.data;

    const report = await submitBugReport({
      userId,
      title,
      description,
      severity,
      category,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      pageUrl,
      browserInfo: browserInfo as Record<string, unknown> | undefined,
    });

    res.status(201).json({ success: true, data: { id: report.id } });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/bug-reports:
 *   get:
 *     summary: List all bug reports (admin only)
 *     tags: [Bug Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, investigating, resolved, closed]
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
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
 *         description: List of bug reports
 */
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const severity =
      typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const limit = req.query.limit
      ? Math.min(parseInt(req.query.limit as string, 10), 200)
      : 50;
    const offset = req.query.offset
      ? parseInt(req.query.offset as string, 10)
      : 0;

    const reports = await listBugReports({ status, severity, limit, offset });
    res.json({ success: true, data: reports });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /api/bug-reports/{id}/status:
 *   patch:
 *     summary: Update the status of a bug report (admin only)
 *     tags: [Bug Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [open, investigating, resolved, closed]
 *     responses:
 *       200:
 *         description: Updated bug report
 *       400:
 *         description: Invalid status
 *       404:
 *         description: Bug report not found
 */
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) throw AppError.badRequest('id must be a valid integer');

    const parsed = updateStatusBody.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest('Validation failed', 'VALIDATION_ERROR', {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }

    const report = await updateBugReportStatus(id, parsed.data.status);
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

export default router;
