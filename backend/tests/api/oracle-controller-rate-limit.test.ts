import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createHmac } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const mockIncrWithExpire = jest.fn();
const mockRedisTtl = jest.fn();

jest.mock('../../src/services/redis-lua', () => ({
  incrWithExpire: mockIncrWithExpire,
}));

jest.mock('../../src/config/redis', () => ({
  redis: {
    ttl: mockRedisTtl,
  },
}));

jest.mock('../../src/oracle/OracleService', () => ({
  submitFightResult: jest.fn().mockResolvedValue({}),
}));

import { submitOracleResult } from '../../src/api/controllers/OracleController';

function buildReq(body: Record<string, unknown>) {
  return { body } as Request;
}

function buildRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('OracleController rate limiting', () => {
  const matchId = 'match-42';
  const secret = 'oracle-secret';
  const oracleAddress = 'GTESTORACLEADDRESS123456789012345678901234567890';
  const outcome = 'fighter_a';
  const reportedAt = '2026-10-18T12:00:00.000Z';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ORACLE_HMAC_SECRET = secret;
    delete process.env.ORACLE_UPDATE_LIMIT;
    delete process.env.ORACLE_UPDATE_WINDOW_MS;
    mockRedisTtl.mockResolvedValue(15);
  });

  it('rejects oracle updates above the configured max within the configured window', async () => {
    process.env.ORACLE_UPDATE_LIMIT = '2';
    process.env.ORACLE_UPDATE_WINDOW_MS = '60000';
    mockIncrWithExpire.mockResolvedValue(3);

    const message = `${matchId}|${outcome}|${reportedAt}|${oracleAddress}`;
    const signature = createHmac('sha256', secret).update(message).digest('hex');
    const req = buildReq({ match_id: matchId, outcome, reported_at: reportedAt, signature, oracle_address: oracleAddress });
    const res = buildRes();
    const next = jest.fn() as NextFunction;

    await submitOracleResult(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err.statusCode).toBe(429);
    expect(err.message).toContain('Rate limit exceeded');
    expect(err.message).toContain('2 updates per 60 seconds');
  });

  it('allows an update when the request count remains under the configured limit', async () => {
    process.env.ORACLE_UPDATE_LIMIT = '2';
    process.env.ORACLE_UPDATE_WINDOW_MS = '60000';
    mockIncrWithExpire.mockResolvedValue(1);

    const message = `${matchId}|${outcome}|${reportedAt}|${oracleAddress}`;
    const signature = createHmac('sha256', secret).update(message).digest('hex');
    const req = buildReq({ match_id: matchId, outcome, reported_at: reportedAt, signature, oracle_address: oracleAddress });
    const res = buildRes();
    const next = jest.fn() as NextFunction;

    await submitOracleResult(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ message: 'Accepted' });
  });
});
