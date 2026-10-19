import { Request, Response } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { UserService } from '../../services/user.service.js';
import { streamUserHistoryReport } from '../../services/export.service.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import { UserTier } from '@prisma/client';
import { logger } from '../../utils/logger.js';

const userService = new UserService();

/**
 * Ingress-level rate limiting (issue #151).
 *
 * The Ingress controller enforces the primary per-IP / per-user limits and
 * returns HTTP 429 with a `Retry-After` header when a client exceeds them.
 * These helpers let the controller surface the same contract when a request
 * is rejected upstream (e.g. the ingress forwards a 429) or when a local
 * guard trips, so clients always receive a consistent rate limit response.
 */
const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

function isRateLimitError(error: any): boolean {
  return (
    error?.status === 429 ||
    error?.statusCode === 429 ||
    error?.code === 'RATE_LIMITED' ||
    error?.code === 'TOO_MANY_REQUESTS'
  );
}

function sendRateLimitResponse(res: Response, retryAfterSeconds = RATE_LIMIT_RETRY_AFTER_SECONDS) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please retry later.',
      retryAfter: retryAfterSeconds,
    },
    message: 'Too many requests. Please retry later.',
  });
}

export class UsersController {
  /**
   * GET /api/users/:id — public; returns public profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const profile = await userService.getPublicProfile(id);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.getProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/me — requires auth; updates username and/or avatarUrl (issue #36)
   */
  async updateMyProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const updated = await userService.updateProfile(userId, req.body);
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      if (error.message === 'Username already taken') {
        return res.status(409).json({
          success: false,
          error: { code: 'USERNAME_TAKEN', message: 'Username is already in use' },
        });
      }
      logger.error('UsersController.updateMyProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/users/me — requires auth; returns full profile
   */
  async getMyProfile(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user!.userId;
      const profile = await userService.getMyProfile(userId);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.getMyProfile error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/users — admin only; paginated user list with filters
   */
  async listUsers(req: AuthenticatedRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const role = req.query.role as UserTier | undefined;
      const status = req.query.status as 'active' | 'suspended' | undefined;
      const search = req.query.search as string | undefined;

      if (role && !Object.values(UserTier).includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      if (status && !['active', 'suspended'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }

      const result = await userService.listUsers({ page, limit, role, status, search });
      return res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      logger.error('UsersController.listUsers error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/:id/suspend — admin only; suspends user and invalidates sessions
   */
  async suspendUser(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      await userService.suspendUser(id);
      return res.status(200).json({ success: true, message: 'User suspended' });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.suspendUser error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * PATCH /api/users/:id/role — admin only; updates user role
   */
  async updateRole(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !Object.values(UserTier).includes(role)) {
        return res.status(400).json({
          success: false,
          message: `Invalid role. Valid values: ${Object.values(UserTier).join(', ')}`,
        });
      }

      const user = await userService.updateUserRole(id, role as UserTier);
      return res.status(200).json({ success: true, data: { id: user.id, tier: user.tier } });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        return sendRateLimitResponse(res);
      }
      if (error.message === 'User not found') {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      logger.error('UsersController.updateRole error', { error });
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * GET /api/users/:address/history/export
   * Generates and streams structured CSV or JSON audit reports of all bets, wins, losses,
   * deposits, and claim events for a Stellar address.
   */
  async exportHistory(req: Request, res: Response) {
    try {
      const { address } = req.params;
      const formatParam = ((req.query.format as string) || 'csv').toLowerCase();
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      // Validate Stellar address format
      if (!address || !StrKey.isValidEd25519PublicKey(address)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ADDRESS', message: 'Invalid Stellar address format' },
          message: 'Invalid Stellar address format',
        });
      }

      // Validate format parameter
      if (formatParam !== 'csv' && formatParam !== 'json') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_FORMAT', message: 'Invalid format. Supported formats: csv, json' },
          message: 'Invalid format. Supported formats: csv, json',
        });
      }

      // Validate dates
      if (startDate) {
        const d = new Date(startDate);
        if (isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_DATE', message: 'Invalid startDate format. Use ISO 8601 string.' },
            message: 'Invalid startDate format. Use ISO 8601 string.',
          });
        }
      }
      if (endDate) {
        const d = new Date(endDate);
        if (isNaN(d.getTime())) {
          return res.status(400).json({
            success: false,
            error: { code: 'INVALID_DATE', message: 'Invalid endDate format. Use ISO 8601 string.' },
            message: 'Invalid endDate format. Use ISO 8601 string.',
          });
        }
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_DATE_RANGE', message: 'startDate cannot be after endDate' },
          message: 'startDate cannot be after endDate',
        });
      }

      await streamUserHistoryReport(res, {
        address,
        format: formatParam as 'csv' | 'json',
        startDate,
        endDate,
      });
    } catch (error: any) {
      if (isRateLimitError(error)) {
        if (!res.headersSent) {
          return sendRateLimitResponse(res);
        }
        return;
      }
      logger.error('UsersController.exportHistory error', { error });
      if (!res.headersSent) {
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }
  }
}

export const usersController = new UsersController();
