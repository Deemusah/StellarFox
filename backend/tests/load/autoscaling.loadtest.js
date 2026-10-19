import { check } from 'k6';
import http from 'k6/http';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    healthChecks: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '180s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      gracefulStop: '5s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const response = http.get(`${BASE_URL}/health`);
  check(response, { 'health endpoint returns 200': (res) => res.status === 200 });
}
