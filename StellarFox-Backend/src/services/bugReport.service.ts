// backend/src/services/bugReport.service.ts
// Handles bug report submissions, listing, and status updates.

import { pool } from '../config/db';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';

export interface BugReportInput {
  userId?: string;
  title: string;
  description: string;
  severity?: string;
  category?: string;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  pageUrl?: string;
  browserInfo?: Record<string, unknown>;
}

export interface BugReport {
  id: number;
  user_id: string | null;
  title: string;
  description: string;
  severity: string;
  category: string;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  page_url: string | null;
  browser_info: Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
}

const VALID_STATUSES = ['open', 'investigating', 'resolved', 'closed'] as const;

/**
 * Persists a new bug report. `userId` is optional — anonymous reports are
 * accepted from unauthenticated visitors.
 */
export async function submitBugReport(input: BugReportInput): Promise<BugReport> {
  const {
    userId,
    title,
    description,
    severity = 'medium',
    category = 'general',
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    pageUrl,
    browserInfo,
  } = input;

  const result = await pool.query<BugReport>(
    `INSERT INTO bug_reports
       (user_id, title, description, severity, category,
        steps_to_reproduce, expected_behavior, actual_behavior,
        page_url, browser_info)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      userId ?? null,
      title,
      description,
      severity,
      category,
      stepsToReproduce ?? null,
      expectedBehavior ?? null,
      actualBehavior ?? null,
      pageUrl ?? null,
      JSON.stringify(browserInfo ?? {}),
    ],
  );
  logger.info(
    { bugReportId: result.rows[0].id, severity, category },
    'Bug report submitted',
  );
  return result.rows[0];
}

/**
 * Lists bug reports ordered newest-first. Supports optional filtering by
 * status and severity with standard limit/offset pagination.
 */
export async function listBugReports(opts: {
  status?: string;
  severity?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<BugReport[]> {
  const { status, severity, limit = 50, offset = 0 } = opts;

  const params: unknown[] = [];
  const conditions: string[] = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const result = await pool.query<BugReport>(
    `SELECT * FROM bug_reports
     ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params,
  );
  return result.rows;
}

/**
 * Updates the status of a bug report. Admin-only operation.
 */
export async function updateBugReportStatus(
  id: number,
  status: string,
): Promise<BugReport> {
  if (!(VALID_STATUSES as readonly string[]).includes(status)) {
    throw AppError.badRequest(
      `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      'INVALID_STATUS',
    );
  }
  const result = await pool.query<BugReport>(
    `UPDATE bug_reports
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, id],
  );
  if ((result.rowCount ?? 0) === 0) throw AppError.notFound('Bug report not found');
  return result.rows[0];
}
