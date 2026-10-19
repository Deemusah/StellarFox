import express from 'express';
import request from 'supertest';
import marketRouter from '../../src/routes/market.routes';
import * as MarketService from '../../src/services/MarketService';

jest.mock('../../src/services/MarketService');
jest.mock('../../src/middleware/requireAdminJwt.middleware', () => ({
  requireAdminJwt: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const app = express();
app.use('/api/markets', marketRouter);

describe('GET /api/markets search and filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (MarketService.getMarkets as jest.Mock).mockResolvedValue({ markets: [], total: 0 });
  });

  it('passes full-text search, category, status, date range, and pagination to the service', async () => {
    const dateFrom = '2026-06-01T00:00:00Z';
    const dateTo = '2026-06-30T23:59:59Z';
    const response = await request(app).get(
      `/api/markets?search=${encodeURIComponent('canelo garden')}` +
      `&category=Middleweight&status=open&dateFrom=${encodeURIComponent(dateFrom)}` +
      `&dateTo=${encodeURIComponent(dateTo)}&page=2&limit=10`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ markets: [], total: 0, page: 2, limit: 10 });
    expect(MarketService.getMarkets).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'canelo garden',
        category: 'Middleweight',
        status: 'open',
        dateFrom: new Date(dateFrom),
        dateTo: new Date(dateTo),
      }),
      { page: 2, limit: 10 },
    );
  });

  it('rejects a date range with dateFrom after dateTo', async () => {
    const response = await request(app).get(
      '/api/markets?dateFrom=2026-07-01T00%3A00%3A00Z&dateTo=2026-06-01T00%3A00%3A00Z',
    );

    expect(response.status).toBe(422);
    expect(MarketService.getMarkets).not.toHaveBeenCalled();
  });

  it('rejects a blank full-text search', async () => {
    const response = await request(app).get('/api/markets?search=%20%20');

    expect(response.status).toBe(422);
    expect(MarketService.getMarkets).not.toHaveBeenCalled();
  });

  it('rejects a search containing no searchable terms', async () => {
    const response = await request(app).get('/api/markets?search=%21%21%21');

    expect(response.status).toBe(422);
    expect(MarketService.getMarkets).not.toHaveBeenCalled();
  });
});
