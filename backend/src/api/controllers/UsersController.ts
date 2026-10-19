import { Request, Response, NextFunction } from 'express';
import { StrKey } from '@stellar/stellar-sdk';
import { UserService } from '../../services/user.service.js';
import { streamUserHistoryReport } from '../../services/export.service.js';
import { AuthenticatedRequest } from '../../types/auth.types.js';
import { UserTier } from '../../types/auth.types.js';
import { AppError } from '../../utils/AppError.js';
import { ERROR_CODES } from '../../constants/errorCodes.js';
import { logger } from '../../utils/logger.js';

const userService = new UserService();

export class UsersController {
  /**
   * GET /api/users/:id — public; returns public profile
   */
  async getProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const profile = await userService.getPublicProfile(id);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return next(AppError.notFound('User not found', ERROR_CODES.NOT_FOUND));
      }
      next(error);
    }
  }

  /**
   * PATCH /api/users/me — requires auth; updates username and/or avatarUrl (issue #36)
   */
  async updateMyProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const updated = await userService.updateProfile(userId, req.body);
      return res.status(200).json({ success: true, data: updated });
    } catch (error: any) {
      if (error.message === 'Username already taken') {
        return next(
          new AppError(409, 'Username is already in use', ERROR_CODES.RESOURCE_ALREADY_EXISTS),
        );
      }
      next(error);
    }
  }

  /**
   * GET /api/users/me — requires auth; returns full profile
   */
  async getMyProfile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.userId;
      const profile = await userService.getMyProfile(userId);
      return res.status(200).json({ success: true, data: profile });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return next(AppError.notFound('User not found', ERROR_CODES.NOT_FOUND));
      }
      next(error);
    }
  }

  /**
   * GET /api/users — admin only; paginated user list with filters
   */
  async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const role = req.query.role as UserTier | undefined;
      const status = req.query.status as 'active' | 'suspended' | undefined;
      const search = req.query.search as string | undefined;

      if (role && !Object.values(UserTier).includes(role)) {
        return next(
          new AppError(422, 'Invalid role', ERROR_CODES.INVALID_REQUEST, {
            field: 'role',
            validValues: Object.values(UserTier),
          }),
        );
      }
      if (status && !['active', 'suspended'].includes(status)) {
        return next(
          new AppError(422, 'Invalid status', ERROR_CODES.INVALID_REQUEST, {
            field: 'status',
            validValues: ['active', 'suspended'],
          }),
        );
      }

      const result = await userService.listUsers({ page, limit, role, status, search });
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/users/:id/suspend — admin only; suspends user and invalidates sessions
   */
  async suspendUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await userService.suspendUser(id);
      return res.status(200).json({ success: true, message: 'User suspended' });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return next(AppError.notFound('User not found', ERROR_CODES.NOT_FOUND));
      }
      next(error);
    }
  }

  /**
   * PATCH /api/users/:id/role — admin only; updates user role
   */
  async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !Object.values(UserTier).includes(role)) {
        return next(
          new AppError(
            422,
            `Invalid role. Valid values: ${Object.values(UserTier).join(', ')}`,
            ERROR_CODES.INVALID_REQUEST,
            { field: 'role', received: role, validValues: Object.values(UserTier) },
          ),
        );
      }

      const user = await userService.updateUserRole(id, role as UserTier);
      return res.status(200).json({ success: true, data: { id: user.id, tier: user.tier } });
    } catch (error: any) {
      if (error.message === 'User not found') {
        return next(AppError.notFound('User not found', ERROR_CODES.NOT_FOUND));
      }
      next(error);
    }
  }

  /**
   * GET /api/users/:address/history/export
   * Generates and streams structured CSV or JSON audit reports of all bets, wins, losses,
   * deposits, and claim events for a Stellar address.
   */
  async exportHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const { address } = req.params;
      const formatParam = ((req.query.format as string) || 'csv').toLowerCase();
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;

      // Validate Stellar address format
      if (!address || !StrKey.isValidEd25519PublicKey(address)) {
        return next(
          new AppError(400, 'Invalid Stellar address format', ERROR_CODES.INVALID_REQUEST, {
            field: 'address',
          }),
        );
      }

      // Validate format parameter
      if (formatParam !== 'csv' && formatParam !== 'json') {
        return next(
          new AppError(422, 'Invalid format. Supported formats: csv, json', ERROR_CODES.INVALID_REQUEST, {
            field: 'format',
            validValues: ['csv', 'json'],
          }),
        );
      }

      // Validate dates
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return next(
          new AppError(422, 'Invalid startDate format. Use ISO 8601 string.', ERROR_CODES.INVALID_REQUEST, {
            field: 'startDate',
          }),
        );
      }
      if (endDate && isNaN(new Date(endDate).getTime())) {
        return next(
          new AppError(422, 'Invalid endDate format. Use ISO 8601 string.', ERROR_CODES.INVALID_REQUEST, {
            field: 'endDate',
          }),
        );
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        return next(
          new AppError(422, 'startDate cannot be after endDate', ERROR_CODES.INVALID_REQUEST, {
            fields: ['startDate', 'endDate'],
          }),
        );
      }

      await streamUserHistoryReport(res, {
        address,
        format: formatParam as 'csv' | 'json',
        startDate,
        endDate,
      });
    } catch (error) {
      if (!res.headersSent) {
        next(error);
      }
    }
  }
}

export const usersController = new UsersController();
