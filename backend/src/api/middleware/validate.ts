import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';
import { AppError } from '../../utils/AppError';
import { ERROR_CODES } from '../../constants/errorCodes';

type Target = 'body' | 'params' | 'query';

/**
 * Format Zod validation errors into a structured list of field/message pairs.
 * These are attached as `details` on the AppError so the error middleware
 * can include them in the standard { error: { ... } } envelope.
 */
function formatErrors(err: ZodError) {
  return err.issues.map((e: ZodIssue) => ({
    field: e.path.join('.') || '(root)',
    message: e.message,
    code: e.code,
  }));
}

export function validate(schema: ZodSchema, target: Target = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = formatErrors(result.error);
      // Use AppError so the global error middleware produces a uniform envelope:
      // { error: { statusCode, message, code, details: [ { field, message, code } ] } }
      return next(
        new AppError(
          422,
          `Validation failed: ${errors.map((e) => `${e.field}: ${e.message}`).join('; ')}`,
          ERROR_CODES.INVALID_REQUEST,
          errors,
        ),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}

// Convenience aliases kept for backward compatibility
export const validateBody = (schema: ZodSchema) => validate(schema, 'body');
export const validateQuery = (schema: ZodSchema) => validate(schema, 'query');
export const validateParams = (schema: ZodSchema) => validate(schema, 'params');
