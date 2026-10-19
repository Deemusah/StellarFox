// backend/src/services/retentionConfig.service.ts
// Manages database retention configuration for different data types.
// Allows admins to configure how long each category of data is kept before cleanup.

import { pool } from '../config/db';
import { AppError } from '../utils/AppError';

export interface RetentionConfig {
  id: number;
  data_type: string;
  retention_days: number;
  enabled: boolean;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
}

export interface RetentionConfigUpdate {
  retentionDays?: number;
  enabled?: boolean;
  description?: string;
}

/**
 * Lists all retention configuration entries ordered alphabetically by data type.
 */
export async function listRetentionConfigs(): Promise<RetentionConfig[]> {
  const result = await pool.query<RetentionConfig>(
    `SELECT * FROM retention_config ORDER BY data_type ASC`,
  );
  return result.rows;
}

/**
 * Returns the retention configuration for a specific data type.
 * Throws 404 if no configuration exists for that data type.
 */
export async function getRetentionConfig(dataType: string): Promise<RetentionConfig> {
  const result = await pool.query<RetentionConfig>(
    `SELECT * FROM retention_config WHERE data_type = $1`,
    [dataType],
  );
  if ((result.rowCount ?? 0) === 0) {
    throw AppError.notFound(`Retention config for '${dataType}' not found`);
  }
  return result.rows[0];
}

/**
 * Creates or updates a retention configuration entry.
 * Uses UPSERT so new data types can be registered on the fly.
 * Only the fields provided in `updates` are changed; others are left intact.
 *
 * @param dataType  - Identifier for the data category (e.g. 'user_sessions')
 * @param updates   - Fields to update
 * @param updatedBy - User ID of the admin making the change (for audit trail)
 */
export async function upsertRetentionConfig(
  dataType: string,
  updates: RetentionConfigUpdate,
  updatedBy?: string,
): Promise<RetentionConfig> {
  const { retentionDays, enabled, description } = updates;

  const result = await pool.query<RetentionConfig>(
    `INSERT INTO retention_config
       (data_type, retention_days, enabled, description, updated_by, updated_at)
     VALUES (
       $1,
       COALESCE($2, 90),
       COALESCE($3, true),
       $4,
       $5,
       NOW()
     )
     ON CONFLICT (data_type) DO UPDATE SET
       retention_days = COALESCE($2, retention_config.retention_days),
       enabled        = COALESCE($3, retention_config.enabled),
       description    = COALESCE($4, retention_config.description),
       updated_by     = COALESCE($5, retention_config.updated_by),
       updated_at     = NOW()
     RETURNING *`,
    [
      dataType,
      retentionDays ?? null,
      enabled ?? null,
      description ?? null,
      updatedBy ?? null,
    ],
  );
  return result.rows[0];
}

/**
 * Retrieves the effective retention period in days for a given data type.
 * Falls back to the provided `defaultDays` if no configuration exists.
 */
export async function getRetentionDays(
  dataType: string,
  defaultDays: number,
): Promise<number> {
  const result = await pool.query<{ retention_days: number; enabled: boolean }>(
    `SELECT retention_days, enabled FROM retention_config WHERE data_type = $1`,
    [dataType],
  );
  if ((result.rowCount ?? 0) === 0 || !result.rows[0].enabled) {
    return defaultDays;
  }
  return result.rows[0].retention_days;
}
