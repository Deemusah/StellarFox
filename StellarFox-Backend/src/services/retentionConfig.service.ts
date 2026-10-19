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

export async function listRetentionConfigs(): Promise<RetentionConfig[]> {
  const result = await pool.query<RetentionConfig>(
    `SELECT * FROM retention_config ORDER BY data_type ASC`,
  );
  return result.rows;
}

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

export async function upsertRetentionConfig(
  dataType: string,
  updates: { retentionDays?: number; enabled?: boolean; description?: string },
  updatedBy?: string,
): Promise<RetentionConfig> {
  const { retentionDays, enabled, description } = updates;
  const result = await pool.query<RetentionConfig>(
    `INSERT INTO retention_config (data_type, retention_days, enabled, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (data_type) DO UPDATE SET
       retention_days = COALESCE($2, retention_config.retention_days),
       enabled = COALESCE($3, retention_config.enabled),
       description = COALESCE($4, retention_config.description),
       updated_by = COALESCE($5, retention_config.updated_by),
       updated_at = NOW()
     RETURNING *`,
    [dataType, retentionDays ?? null, enabled ?? null, description ?? null, updatedBy ?? null],
  );
  return result.rows[0];
}
