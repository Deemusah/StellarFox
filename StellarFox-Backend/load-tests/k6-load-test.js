import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics to surface performance bottlenecks across key endpoints.
const errorRate = new Rate('errors');
const healthLatency = new Trend('health_latency', true);
const marketsLatency = new Trend('markets_latency', true);
const betsLatency = new Trend('bets_latency', true);

// Base URL is configurable so the same scenario is repeatable against any env.
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Realistic load profile: ramp up, hold steady, then ramp down.
export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '10s',
      tags: { scenario: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '10s',
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    // Acceptance criteria: results must show metrics and flag bottlenecks.
    http_req_duration: ['p(95)<500'],
    errors: ['rate<0.01'],
    health_latency: ['p(95)<200'],
    markets_latency: ['p(95)<500'],
    bets_latency: ['p(95)<500'],
  },
};

function request(path, latencyMetric) {
  const res = http.get(`${BASE_URL}${path}`);
  latencyMetric.add(res.timings.duration);
  const ok = check(res, {
    [`${path} status is 2xx/3xx`]: (r) => r.status >= 200 && r.status < 400,
  });
  errorRate.add(!ok);
  return res;
}

export default function () {
  group('health', () => {
    request('/health', healthLatency);
  });

  group('markets', () => {
    request('/api/markets', marketsLatency);
  });

  group('bets', () => {
    request('/api/bets', betsLatency);
  });

  // Simulate think time between user actions.
  sleep(1);
}
