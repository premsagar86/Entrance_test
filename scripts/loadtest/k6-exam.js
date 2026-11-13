// Load test for the exam flow: login -> list tests -> start -> autosave every 10 s -> submit.
// Install k6 (https://k6.io), seed students first (npm run loadtest:seed -- <testId> 500), then run:
//   k6 run -e BASE_URL=https://your-preview.vercel.app -e TEST_ID=<testId> -e VUS=500 scripts/loadtest/k6-exam.js
// Turnstile: point the TARGET (a separate staging/preview project, never your real exam) at Cloudflare's
// documented always-pass test keys: NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA and
// TURNSTILE_SECRET=1x0000000000000000000000000000000AA. This script then sends the dummy token below.
// Never run this against production data during a real exam.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL;
const TEST_ID = __ENV.TEST_ID;
const VUS = Number(__ENV.VUS || 500);
const HOLD_SEC = Number(__ENV.HOLD_SEC || 180); // how long each student "takes" the test

export const options = {
  scenarios: {
    exam: { executor: "ramping-vus", startVUs: 0, stages: [{ duration: "60s", target: VUS }, { duration: `${HOLD_SEC + 60}s`, target: VUS }, { duration: "30s", target: 0 }], gracefulRampDown: "60s" },
  },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<1500"] },
};

const pad = (n) => String(n).padStart(4, "0");
const TOKEN = __ENV.TURNSTILE_TOKEN || "XXXX.DUMMY.TOKEN.XXXX";
const JSON_HEADERS = { "Content-Type": "application/json", "x-requested-with": "fetch", Origin: BASE };

export default function () {
  const n = ((__VU - 1) % 500) + 1;
  const jar = http.cookieJar();
  jar.clear(BASE);

  const login = http.post(`${BASE}/api/auth/student/login`, JSON.stringify({ email: `load${pad(n)}@example.test`, rollNo: `LOAD${pad(n)}`, turnstile: TOKEN }), { headers: JSON_HEADERS });
  if (!check(login, { "login 200": (r) => r.status === 200 })) return;

  http.get(`${BASE}/api/student/tests`);
  const start = http.post(`${BASE}/api/student/tests/${TEST_ID}/start`, null, { headers: JSON_HEADERS });
  if (!check(start, { "start 200": (r) => r.status === 200 })) return;
  const { attemptId, questions } = start.json();

  const end = Date.now() + HOLD_SEC * 1000;
  let q = 0;
  while (Date.now() < end) {
    const question = questions[q % questions.length];
    q++;
    const save = http.put(`${BASE}/api/student/attempts/${attemptId}/answers`, JSON.stringify({ answers: [{ questionId: question.id, selectedOption: q % 4 }] }), { headers: JSON_HEADERS });
    check(save, { "autosave 200": (r) => r.status === 200 });
    sleep(10);
  }
  const submit = http.post(`${BASE}/api/student/attempts/${attemptId}/submit`, JSON.stringify({}), { headers: JSON_HEADERS });
  check(submit, { "submit ok": (r) => r.status === 200 });
}
