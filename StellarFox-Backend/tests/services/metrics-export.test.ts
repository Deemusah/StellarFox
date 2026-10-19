import { exportMetrics, httpRequestsTotal } from '../../src/services/metrics.service';

describe('metrics export', () => {
  const labels = { method: 'GET', route: '/export,test', status_code: '200' };

  beforeAll(() => {
    httpRequestsTotal.inc(labels);
  });

  it('returns registered metrics as JSON', async () => {
    const metrics = JSON.parse(await exportMetrics('json')) as Array<{ name: string }>;

    expect(metrics.some(({ name }) => name === 'http_requests_total')).toBe(true);
  });

  it('returns metric samples as escaped CSV rows', async () => {
    const csv = await exportMetrics('csv');

    expect(csv.startsWith('name,type,help,labels,value\r\n')).toBe(true);
    expect(csv).toContain('"http_requests_total"');
    expect(csv).toContain('""/export,test""');
  });
});