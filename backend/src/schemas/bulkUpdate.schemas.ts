// ============================================================
// BANKERCHANGER — Bulk Update Market Schemas
// Validates the request body for POST /api/admin/markets/bulk-update
// ============================================================

import { z } from 'zod';

/** Fields that an admin can update in bulk on open/locked markets. */
export const bulkUpdateMarketItemSchema = z.object({
  market_id: z
    .string({ required_error: 'market_id is required' })
    .min(1, 'market_id is required')
    .max(128, 'market_id must not exceed 128 characters'),
  fee_bps: z
    .number()
    .int('fee_bps must be an integer')
    .min(0, 'fee_bps cannot be negative')
    .max(1000, 'fee_bps cannot exceed 1000 (10%)')
    .optional(),
  lock_before_secs: z
    .number()
    .int('lock_before_secs must be an integer')
    .min(60, 'lock_before_secs must be at least 60 seconds')
    .max(86400, 'lock_before_secs cannot exceed 86400 seconds (24h)')
    .optional(),
  scheduled_at: z
    .string()
    .datetime({ message: 'scheduled_at must be a valid ISO-8601 datetime string' })
    .optional(),
  venue: z
    .string()
    .trim()
    .max(100, 'venue must not exceed 100 characters')
    .optional(),
  status: z
    .enum(['open', 'locked', 'cancelled'])
    .optional(),
});

export const bulkUpdateMarketsBodySchema = z
  .object({
    updates: z
      .array(bulkUpdateMarketItemSchema)
      .min(1, 'updates must contain at least one item')
      .max(50, 'Cannot update more than 50 markets at once'),
  })
  .superRefine((data, ctx) => {
    for (const [i, item] of data.updates.entries()) {
      const hasField =
        item.fee_bps !== undefined ||
        item.lock_before_secs !== undefined ||
        item.scheduled_at !== undefined ||
        item.venue !== undefined ||
        item.status !== undefined;

      if (!hasField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['updates', i],
          message:
            'At least one updatable field (fee_bps, lock_before_secs, scheduled_at, venue, status) must be provided',
        });
      }
    }
  });

export type BulkUpdateMarketItem = z.infer<typeof bulkUpdateMarketItemSchema>;
export type BulkUpdateMarketsBody = z.infer<typeof bulkUpdateMarketsBodySchema>;
