import { Router } from 'express';
import { profileController } from '../api/controllers/ProfileController';
import { requireAuth } from '../middleware/auth.middleware';
import { validate } from '../api/middleware/validate';
import { updateProfileBody } from '../schemas/profile.schemas';

const router = Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get the authenticated user's extended profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/profile',
  requireAuth,
  profileController.getProfile.bind(profileController),
);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Create or update the authenticated user's extended profile
 *     tags: [Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *               bio:
 *                 type: string
 *                 maxLength: 500
 *               avatarUrl:
 *                 type: string
 *                 format: uri
 *               socialLinks:
 *                 type: object
 *                 properties:
 *                   twitter:
 *                     type: string
 *                   instagram:
 *                     type: string
 *                   website:
 *                     type: string
 *     responses:
 *       200:
 *         description: Updated profile
 *       401:
 *         description: Unauthorized
 *       422:
 *         description: Validation error
 */
router.put(
  '/profile',
  requireAuth,
  validate(updateProfileBody, 'body'),
  profileController.updateProfile.bind(profileController),
);

export default router;
