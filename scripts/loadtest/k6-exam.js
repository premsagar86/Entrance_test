// Load test for the exam flow: login -> list tests -> start -> autosave every 10 s -> submit.
//
// Every student takes the exam once. All students SUBMIT AT THE SAME SECOND (the deadline burst), which is
// the heaviest moment for the database. Logins and starts are spread over RAMP_SEC (a login storm).
// Answers are predictable (see expectedOption). Just before submitting, each student reads the saved answers
// back and compares them with every save the server acknowledged.
//
//   1. Seed:  npm run loadtest:seed -- <testId> 1000      (staging database only, see seed script)
//   2. Run:   k6 run -e BASE_URL=https://staging.example.com -e TEST_ID=<testId> -e VUS=1000 scripts/loadtest/k6-exam.js
//   3. Check: npm run loadtest:verify -- <testId> 1000   (saved answers, scores, statuses)
//   4. Clean: delete the whole staging database (--clean cannot remove students who have attempts)
//
// Env: VUS (default 1000, must be <= seeded students), RAMP_SEC (login/start spread, default 60),
//      HOLD_SEC (time spent answering before the burst, default 120), TURNSTILE_TOKEN,
//      PER_VU_IP=1 (send a distinct X-Forwarded-For per student, to avoid the per-IP login limit).
// Turnstile: point the TARGET (a separate staging project, never your real exam) at Cloudflare's
// always-pass test keys: NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA and
// TURNSTILE_SECRET=1x0000000000000000000000000000000AA.
// k6 from one machine uses one IP: set LOGIN_IP_LIMIT high on staging, or use PER_VU_IP=1 when the
// origin trusts X-Forwarded-For (not behind Cloudflare). For >1000 VUs use several load generators.
// Never run this against production data during a real exam.
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL;
const TEST_ID = __ENV.TEST_ID;
const VUS = Number(__ENV.VUS || 1000);
const RAMP_SEC = Number(__ENV.RAMP_SEC || 60);
const HOLD_SEC = Number(__ENV.HOLD_SEC || 120);

if (!BASE || !TEST_ID) throw new Error("Set BASE_URL and TEST_ID (-e BASE_URL=... -e TEST_ID=...)");

const completed = new Rate("exam_completed"); // every student must end with a submitted attempt
const intact = new Rate("answers_intact"); // no acknowledged save may be missing or changed

// Must match expectedOption() in scripts/loadtest/verify-results.ts.
const expectedOption = (student, questionIndex, optionCount) => (student + questionIndex) % optionCount;

export const options = {
  scenarios: {
    // One iteration per student, all started together; each sleeps a random 0..RAMP_SEC before logging in.
    exam: { executor: "per-vu-iterations", vus: VUS, iterations: 1, maxDuration: `${RAMP_SEC + HOLD_SEC + 600}s` },
  },
  thresholds: {
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: true, delayAbortEval: "30s" }],
    "http_req_duration{name:login}": ["p(95)<2000"],
    "http_req_duration{name:start}": ["p(95)<2500"],
    "http_req_duration{name:autosave}": ["p(95)<500"],
    "http_req_duration{name:submit}": ["p(95)<3000"],
    exam_completed: ["rate>0.99"],
    answers_intact: ["rate==1"],
  },
};

const pad = (n) => String(n).padStart(4, "0");
const TOKEN = __ENV.TURNSTILE_TOKEN || "XXXX.DUMMY.TOKEN.XXXX";

// Runs once before the VUs: fixes the shared moment when everyone submits.
export function setup() {
  return { submitAt: Date.now() + (RAMP_SEC + HOLD_SEC) * 1000 };
}

export default function (data) {
  const n = __VU; // distinct student per VU: no wrapping (seed at least VUS students)
  const headers = { "Content-Type": "application/json", "x-requested-with": "fetch", Origin: BASE };
  if (__ENV.PER_VU_IP) headers["X-Forwarded-For"] = `10.${(n >> 8) & 255}.${n & 255}.${(n % 200) + 1}`;

  sleep(Math.random() * RAMP_SEC); // login storm spread

  const login = http.post(
    `${BASE}/api/auth/student/login`,
    JSON.stringify({ email: `load${pad(n)}@example.test`, rollNo: `LOAD${pad(n)}`, turnstile: TOKEN }),
    { headers, tags: { name: "login" } },
  );
  if (!check(login, { "login 200": (r) => r.status === 200 })) return void completed.add(false);

  http.get(`${BASE}/api/student/tests`, { tags: { name: "list" } });
  const start = http.post(`${BASE}/api/student/tests/${TEST_ID}/start`, null, { headers, tags: { name: "start" } });
  if (!check(start, { "start 200": (r) => r.status === 200 })) return void completed.add(false);
  const { attemptId, questions } = start.json();

  // Answer (autosave every 10 s) until shortly before the shared submit moment.
  const saved = {}; // questionId -> option, only for saves the server acknowledged
  let q = 0;
  while (Date.now() < data.submitAt - 20_000) {
    const index = q % questions.length;
    const question = questions[index];
    const selectedOption = expectedOption(n, index, question.options.length);
    q++;
    const save = http.put(
      `${BASE}/api/student/attempts/${attemptId}/answers`,
      JSON.stringify({ answers: [{ questionId: question.id, selectedOption }] }),
      { headers, tags: { name: "autosave" } },
    );
    if (check(save, { "autosave 200": (r) => r.status === 200 })) saved[question.id] = selectedOption;
    sleep(10);
  }

  // Read the answers back (start resumes the same attempt), spread out so it does not form its own burst.
  sleep(Math.random() * Math.max(0, (data.submitAt - Date.now()) / 1000 - 5));
  const resume = http.post(`${BASE}/api/student/tests/${TEST_ID}/start`, null, { headers, tags: { name: "resume" } });
  const answers = resume.status === 200 ? resume.json("answers") : null;
  intact.add(!!answers && Object.keys(saved).every((id) => answers[id] === saved[id]));

  // Deadline burst: wait for the exact shared moment, then everyone submits together.
  const wait = (data.submitAt - Date.now()) / 1000;
  if (wait > 0) sleep(wait);
  const submit = http.post(`${BASE}/api/student/attempts/${attemptId}/submit`, JSON.stringify({}), { headers, tags: { name: "submit" } });
  completed.add(check(submit, { "submit ok": (r) => r.status === 200 }));
}
