// backend/src/services/feedback.service.ts
// Handles user feedback submissions and retrieval.

import { pool } from '../config/db';
import { logger } from '../utils/logger';

export interface FeedbackInput {
  userId?: string;
  category: string;
  rating?: number;
  message: string;
  pageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface FeedbackRecord {
  id: number;
  user_id: string | null;
  category: string;
  rating: number | null;
  message: string;
  page_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Persists a user feedback entry. `userId` is optional — anonymous feedback is
 * accepted from unauthenticated visitors.
 */
export async function submitFeedback(input: FeedbackInput): Promise<FeedbackRecord> {
  const { userId, category, rating, message, pageUrl, metadata } = input;
  const result = await pool.query<FeedbackRecord>(
    `INSERT INTO user_feedback (user_id, category, rating, message, page_url, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      userId ?? null,
      category,
      rating ?? null,
      message,
      pageUrl ?? null,
      JSON.stringify(metadata ?? {}),
    ],
  );
  logger.info({ feedbackId: result.rows[0].id, category }, 'User feedback submitted');
  return result.rows[0];
}

/**
 * Lists feedback entries ordered newest-first. Supports optional filtering by
 * category and standard limit/offset pagination.
 */
export async function listFeedback(opts: {
  category?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<FeedbackRecord[]> {
  const { category, limit = 50, offset = 0 } = opts;

  const params: unknown[] = [];
  let where = '';

  if (category) {
    params.push(category);
    where = `WHERE category = $${params.length}`;
  }

  params.push(limit, offset);

  const result = await pool.query<FeedbackRecord>(
    `SELECT * FROM user_feedback
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return result.rows;
}

/**
 * Returns the total count of feedback entries, optionally filtered by category.
 */
export async function countFeedback(category?: string): Promise<number> {
  const params: unknown[] = [];
  let where = '';
  if (category) {
    params.push(category);
    where = `WHERE category = $1`;
  }
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM user_feedback ${where}`,
    params,
  );
  return Number(result.rows[0]?.count ?? 0);
}
