import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  vus: 5,
  duration: '30s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const healthRes = http.get(`${BASE_URL}/healthz`);
  check(healthRes, {
    'healthz status 200': (r) => r.status === 200,
  });

  const readyRes = http.get(`${BASE_URL}/readyz`);
  check(readyRes, {
    'readyz status 200': (r) => r.status === 200,
  });

  sleep(1);
}
