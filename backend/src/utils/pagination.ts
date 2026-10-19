/**
 * Shared pagination utilities
 *
 * Provides:
 *  - `PaginationParams`  — validated page/limit inputs
 *  - `PaginationMeta`    — standard response envelope
 *  - `buildPaginationMeta` — compute meta from totals
 *  - `applyOffsetPagination` — apply LIMIT/OFFSET to a JS array
 *  - `paginationSqlClause`   — produce the SQL LIMIT/OFFSET fragment
 *
 * All list endpoints should return:
 *   { data: T[], meta: PaginationMeta }
 *
 * This ensures clients always get the same shape regardless of endpoint.
 */

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Build a standard pagination meta object.
 *
 * @param total  - total number of matching records (before slicing)
 * @param page   - current 1-based page index
 * @param limit  - number of records per page
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/**
 * Slice an in-memory array using offset pagination.
 *
 * @param items - full result set
 * @param page  - 1-based page number
 * @param limit - items per page
 */
export function applyOffsetPagination<T>(
  items: T[],
  page: number,
  limit: number,
): { data: T[]; meta: PaginationMeta } {
  const offset = (page - 1) * limit;
  const data = items.slice(offset, offset + limit);
  const meta = buildPaginationMeta(items.length, page, limit);
  return { data, meta };
}

/**
 * Build the LIMIT / OFFSET SQL fragment and parameterized values for Postgres.
 *
 * @param page         - 1-based page number (already validated)
 * @param limit        - items per page (already validated)
 * @param startIndex   - starting positional parameter index ($N), default 1
 * @returns `{ sql: string, values: number[], nextIndex: number }`
 *
 * @example
 *   const existing = [userId];          // $1 already used
 *   const { sql, values } = paginationSqlClause(page, limit, 2);
 *   const rows = await pool.query(
 *     `SELECT * FROM bets WHERE bettor_id = $1 ${sql}`,
 *     [...existing, ...values],
 *   );
 */
export function paginationSqlClause(
  page: number,
  limit: number,
  startIndex: number = 1,
): { sql: string; values: number[]; nextIndex: number } {
  const offset = (page - 1) * limit;
  const sql = `LIMIT $${startIndex} OFFSET $${startIndex + 1}`;
  return { sql, values: [limit, offset], nextIndex: startIndex + 2 };
}
