# Aptitude Test Platform — Architecture & Build Plan (free stack, security-hardened)

## Context
Build a web platform where students log in with **Email + Date of Birth, or Email + Roll No**, take a timed aptitude test, and see results. An **Admin** logs in with **Email + Phone + email OTP**, uploads question documents, publishes tests, views every student's score and performance, and posts announcements.

Decisions: **Next.js 14 (full-stack, TypeScript) + PostgreSQL**, scale **under 500 concurrent users**, **all-free tools**. Students and admins live in **separate tables** (different credentials, data and lifecycles; stronger isolation).

## Decisions (resolved)
1. **Hosting**: commercial status unknown, so **Option B (self-hosted VPS: Docker Compose + Caddy)** is the primary deployment. Option A (Vercel Hobby) is non-commercial only and has a 10 s function limit.
2. **Marking**: no negative marking (column kept, default 0). 1 mark per question by default.
3. **Results**: shown instantly after submit (`results_released_at` set on submit). Admin can optionally hold results per test. Correct answers are hidden unless the admin enables it.
4. **Admin OTP**: by email (Brevo API). Default, not yet confirmed.
5. **Answer keys**: mixed. Questions with no key get `correct_option = NULL` and **a test cannot be published until every question has a key**.

## Remaining gaps to handle in the build
- DOB is a weak login factor (about 10^4 plausible dates): require Turnstile from the first attempt, strict per-email lockout, and prefer Roll No.
- Add `GET /api/health` and a backup restore drill to the hardening phase.
- Option B: keep pg-boss for the parsing queue and a nightly `pg_dump` backup to R2.

## Requirements and gaps found in the cross-check
1. **Student roster**: email, roll no and DOB are pre-registered by the admin (CSV upload). Nobody self-registers. Email is required and unique.
2. **Student login** is Email + DOB or Email + Roll No. Both are brute-forceable, so see Security.
3. **Admin login** is Email + Phone. Both are easy to learn, so a mandatory **email OTP** second step is added.
4. **Question type**: MCQ, single correct answer.
5. **Timer**: server-enforced duration with auto-submit at expiry. One attempt per student, resume after refresh or disconnect.
6. **Scheduling**: start/end window and assignment to students or batches.
7. **Extra admin features**: release results, reset attempt (allow retake), manual question entry, multiple admins with audit of their actions, data retention and deletion, health check.
8. **Exports**: CSV of results and ranks, with formula-injection protection.
9. **Anti-cheating (optional)**: shuffle questions and options (**not implemented yet**), tab-switch logging (implemented). A deterrent, not a security control.
10. **Announcements and "What's New"** (see below).

## Free tech stack

| Layer | Choice | Notes |
|---|---|---|
| App (UI + API) | Next.js 14 (patched, at least 14.2.25) + TypeScript | one codebase for both panels |
| Styling | Tailwind CSS + shadcn/ui | |
| Database | **Neon Postgres** (or Supabase) | use the pooled connection string |
| ORM | Prisma | parameterized queries |
| File storage | **Cloudflare R2** (or Supabase Storage) | uploads, never public |
| Email (OTP, notices) | **Brevo** API | free tier |
| Bot protection | **Cloudflare Turnstile** | free CAPTCHA |
| AI extraction | **Google Gemini API (free tier)** | also reads scanned PDFs/images, so no OCR library needed |
| Parsing | mammoth (DOCX), pdfjs-dist (PDF), xlsx (XLSX/CSV) | |
| Validation / sessions | Zod, `jose`, Node `crypto` | |
| Charts | CSS bars (no chart library; Recharts not used) | |
| Testing | Vitest, Playwright, k6 | |
| CI / alerts | GitHub Actions, Dependabot | |

The Claude API is paid, so Gemini's free tier replaces it. The regex template parser needs no AI at all.

Note: Vercel Hobby is for **non-commercial use only**. A commercial exam needs a paid Vercel plan, Railway, or the VPS option.

## Document → Questions extraction
Uploaded files are untrusted and arbitrarily formatted, so the **admin review step is a mandatory gate**.

1. **Upload and validate**: allow only pdf, docx, txt, csv, xlsx, png, jpg. "Any file type" is **not** allowed. Reject macro formats (docm, xlsm), executables and archives. Check magic bytes, not just extension or MIME. 4 MB limit (current code; Vercel request bodies are capped at 4.5 MB).
2. **Text extraction** (inside the upload request, with timeout, size and page limits): DOCX with `mammoth`; PDF with `pdfjs-dist`; XLSX/CSV with `xlsx`; scanned PDF/image via Gemini vision.
3. **Structuring into questions**:
   - **A. Template parser** (free): regex for `Q1.` / `A) B) C) D)` / `Answer: B`.
   - **B. AI fallback (Gemini)**: JSON schema output `{question, options[], correctAnswer, explanation, marks}`; low-confidence items flagged.
   - Document text is **data, not instructions**: the model gets no tools, output is validated with Zod, question count and field lengths are capped (guards against prompt injection).
4. **Admin review screen**: edit, delete, add questions, fix answer keys. Status `DRAFT → PUBLISHED`.
5. Only published tests are visible to students. The original file is kept for audit.

## Architecture
```
Browser (Student UI / Admin UI)  -- HTTPS -->  Next.js 14 (App Router)
                                               |- UI pages (React, Tailwind, shadcn/ui)
                                               |- REST route handlers /api/*
                                               |- Middleware (coarse route guard, security headers)
                                               '- Services: auth, tests, attempts, scoring, parsing, announcements
                                                      |
                          +---------------------------+-----------------------+
                    Neon Postgres (Prisma)     Cloudflare R2 (files)       Gemini API (extraction)
                                               Brevo (email OTP)          Turnstile (CAPTCHA)
```
- **Auth**: server-side sessions. Middleware is only a coarse guard; **every route handler re-checks session and role** (middleware-only auth is bypassable, cf. CVE-2025-29927).
- **Orchestration** (attempt lifecycle): `start` creates an attempt with `expires_at = now + duration` (server clock), answers autosave every 10-15 s in one batched request, `submit` locks the attempt in a DB transaction, scoring runs on the server, result is stored, then shown or released.
- **Expired attempts**: finished lazily when the next request touches them, plus a daily cron cleanup.
- **Rate limits**: Postgres `rate_limits` table.

## Deployment
**Option A: Vercel (Hobby) + Neon + R2** (easiest, about 30 minutes; non-commercial use only)
1. Push the code to GitHub.
2. Import the repo in Vercel and set the environment variables.
3. Create the Neon database, run `npx prisma migrate deploy`.
4. Seed the first admin.
5. Optional custom domain; HTTPS is automatic.

Serverless consequences: no pg-boss or background workers; parse documents inside the upload request; use Neon's pooled connection string; keep autosave batched.

**Option B: one free VPS (Oracle Cloud Always Free)**
Docker Compose with Next.js, Postgres and Caddy (automatic HTTPS). Full control, no cold starts, and pg-boss becomes possible. You manage updates, firewall and a nightly `pg_dump` backup.

**Expectation**: 1000 simultaneous students is heavy for free tiers. Load-test early and keep a fallback (Option B or a paid database) for exam day.

## Scaling to 1000 concurrent users
Keep the stack (Next.js + Prisma + PostgreSQL); harden it. No rewrite.

**Load model**: 1000 students autosaving every 10 s is about 100 requests/s sustained. Peaks: a login burst, a start burst when the test opens, and a submit burst at the deadline. The risk is database connections and slow queries, not raw volume.

**Steps (in priority order)**
1. **Connection pooling**: set `connection_limit` (5-10) per replica in `DATABASE_URL`; use PgBouncer (transaction mode) or Neon's pooled URL with `pgbouncer=true`; keep `DIRECT_URL` (non-pooled) for migrations. `src/lib/db.ts` currently uses Prisma's default pool (cores x 2 + 1 per process).
2. **Submit path** (`src/lib/attempts.ts` `finalizeAttempt`): cache the question keys per instance (immutable once published), replace the one-UPDATE-per-answer loop with a single bulk statement (or derive `is_correct` at read time), and set the transaction `timeout` to about 15 s (Prisma default is 5 s).
3. **Load test**: k6 at 1000 VUs on a staging copy. Seed 1000 students, fix the `% 500` user wrap in `scripts/loadtest/k6-exam.js`, add a deadline-burst submit scenario and per-endpoint thresholds (p95 under 500 ms for ordinary calls, error rate under 1%). Run in stages: 100, 300, 500, 1000, then 1500 to find the breaking point.
4. **Indexes** (confirm with `EXPLAIN ANALYZE`): `attempts(student_id)`, `attempts(test_id, status)` or `(test_id, score)` for ranking, `attempts(status, expires_at)` for cleanup, `answers(question_id)` for FK deletes. `answers` PK `(attempt_id, question_id)` and `attempts` UNIQUE `(test_id, student_id)` already cover the hot lookups.
5. **Autosave**: client-side debounce/batching, server upsert on `(attempt_id, question_id)`, guard against out-of-order writes (`answered_at` or a sequence number). Review `src/app/api/student/attempts/[id]/answers` and the client code.
6. **Replicas**: 2-3 app instances behind Caddy (list the upstreams) or Railway's built-in balancer. Uploads must be on R2 (a local volume is not shared). The per-instance 60 s question cache is fine. Move rate limiting to Redis only if the load test shows the `rate_limits` upserts are hot.
7. **Staggered start**: client jitter (random 0-5 s with a "preparing" message), a start window, and cache warm-up just before opening. Start each student's countdown only after the questions have loaded.
8. **Sizing**: app 4 vCPU / 8 GB in total, database 2-4 vCPU / 4-8 GB on a separate machine, same region as the app (every query is a network round trip). Neon: scale-to-zero off, larger compute on exam day.

**Deliberately not done**: DB read replicas (the load is write-heavy, and replica lag would break "see my result right after submit"; revisit only to offload admin analytics/exports), microservices, Kubernetes, Kafka.

**Estimated running cost** (rough, verify current pricing): single VPS about $15-50/mo; Railway + Neon + R2 about $60-150/mo. The load is bursty, so scale up only on exam days.

## ChatGPT suggestions vs this project
| Suggestion | Our project | Decision |
|---|---|---|
| PostgreSQL, not MongoDB | PostgreSQL 16 | Agree, already done |
| Server-side timer (`started_at`, `expires_at`) | `attempts.expires_at` + 5 s grace | Already done |
| Idempotent transactional submit | `finalizeAttempt` row lock, repeat returns stored result | Already done (optimize, see step 2) |
| Never send correct answers to the browser | Start payload excludes `correct_option` | Already done |
| Autosave | Every 10 s, batched | Already done (review, see step 5) |
| k6 load testing | `scripts/loadtest/k6-exam.js` | Already done (extend to 1000) |
| Connection pooling (PgBouncer / proxy) | Default Prisma pool | **Adopt** (step 1) |
| Indexes + `EXPLAIN ANALYZE` | Hot lookups covered, a few gaps | **Adopt** (step 4) |
| Redis cache + rate limiting | In-process cache, Postgres rate limiter | Adopt only if the load test shows it is needed |
| BullMQ queue | pg-boss (Postgres-backed) in the plan | Do not adopt: pg-boss needs no Redis |
| React + Vite + NestJS rewrite | Next.js full-stack | Do not adopt: no capacity benefit, high risk |
| AWS ECS/Fargate + RDS + OpenTelemetry | Railway/VPS + Neon + Sentry | Do not adopt: overkill and costlier at 1000 users |
| Microservices, Kubernetes, Kafka | Modular monolith | Do not adopt (ChatGPT agrees they are unnecessary) |
| DB read replicas | None | Do not adopt for launch (see above) |

**Glossary**
- **BullMQ**: Node job queue stored in Redis; a worker process runs jobs outside the web request.
- **AWS ECS/Fargate**: Amazon's container orchestrator (ECS) with serverless machines (Fargate). Powerful, heavy to set up.
- **RDS**: Amazon's managed PostgreSQL/MySQL (backups, failover, replicas). Same idea as Neon.
- **OpenTelemetry**: open standard for traces/metrics/logs. Useful for many services; for one Next.js app, Sentry plus platform logs and `pg_stat_statements` are enough.

## Remaining work / status
Each item below maps to a row in **Required changes** (section after this checklist).
- [ ] **Uploads return 503 on Vercel**: set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` for the **Production** environment and redeploy. Code side done: `src/app/api/admin/documents/route.ts` returns a clear 503 and logs `document storage failed` (uncommitted).
- [ ] Optional: disable the Vercel Toolbar. Its `feedback.js` inline styles and the `vercel.live` iframe are blocked by our strict CSP. Harmless; do not loosen the CSP.
- [ ] Pooling config (`DATABASE_URL` params, PgBouncer or Neon pooled URL).
- [ ] `finalizeAttempt` optimization and transaction timeout.
- [ ] Indexes + Prisma migration.
- [ ] Autosave route/client review (upsert, debounce, ordering guard).
- [ ] Staggered test start.
- [ ] 1000-user k6 run (seed 1000 students, fix the 500 wrap, add deadline burst).
- [ ] Replicas + Caddy upstreams (or Railway replicas).
- [ ] `GET /api/health`, error tracking (Sentry), backup restore drill.
- [ ] Neon: scale-to-zero off and a larger compute on exam day.

## Required changes
Result of a full codebase review (backend, frontend, build/deploy). **Priority:** P0 = must fix before a 1000-student exam, P1 = should fix, P2 = later/optional. File references are `path:line` as of this review.

### A. Build: backend and database
| # | Pri | Change | Where | Why |
|---|---|---|---|---|
| B1 | P0 | Count only failed logins toward the IP limit; set `LOGIN_IP_LIMIT` >= 1500; stop updating one hot row per login | `src/app/api/auth/student/login/route.ts:24,32`, `DEPLOY.md:96`, `.env.example` | Default 600/15 min blocks a 1000-student campus behind one IP and serialises the login burst |
| B2 | P0 | `finalizeAttempt`: single bulk UPDATE (or derive `is_correct` at read time), use the question cache, pass `{ maxWait, timeout: ~15s }` | `src/lib/attempts.ts:24,52-58` | One UPDATE per answer plus the default 5 s transaction timeout fails at the deadline burst |
| B3 | P0 | Result route must not re-lock/re-score finished attempts (skip the transaction when status != IN_PROGRESS) | `src/app/api/student/attempts/[id]/result/route.ts:25` | Every result view takes `FOR UPDATE` and reloads all questions/answers |
| B4 | P0 | Autosave: make the upsert conditional on the attempt still being IN_PROGRESS (`EXISTS`); add an ordering guard (client sequence/timestamp) | `src/app/api/student/attempts/[id]/answers/route.ts:30-55` | Check-then-write race lets answers land after scoring; last-write-wins by arrival |
| B5 | P0 | Add indexes + migration: `test_assignments(student_id)`, `attempts(student_id)`, `attempts(status, expires_at)`, `answers(question_id)`, `sessions(absolute_expires_at)`, `rate_limits(window_start)` | `prisma/schema.prisma`, new migration | Dashboard, results, cleanup and cascade deletes currently scan |
| B6 | P0 | Pool config per host: `connection_limit` 5-10 per replica on persistent hosts (1 only for serverless); fix contradictory docs | `src/lib/db.ts`, `DEPLOY.md:23,96`, `docker-compose.yml:49-50,73-74` | Default pool (cores*2+1) x replicas can exhaust Postgres `max_connections` |
| B7 | P1 | Hide `correctOption`/`explanation` until the test window has ended or the admin releases | `result/route.ts:29-36` | Early finishers can share answers with students still inside the window |
| B8 | P1 | Reject admin reset of IN_PROGRESS attempts (409) | `src/app/api/admin/attempts/[id]/reset/route.ts:18` | Later autosave hits an FK violation -> 500 |
| B9 | P1 | `assertSameOrigin`: treat `Origin: null` / bad URL as 403 | `src/lib/auth.ts:26` | `new URL()` throws -> 500 |
| B10 | P1 | `clientIp`: use the platform header / right-most trusted hop | `src/lib/http.ts:4-8` | Left-most `X-Forwarded-For` is spoofable (bypasses IP limits) |
| B11 | P1 | Cache `activeMaintenance()` and `/api/announcements` for 5-10 s | `src/lib/announcements.ts:17`, `src/app/api/announcements/route.ts` | A query per start / page load by every student |
| B12 | P1 | Cleanup: finalize in parallel chunks; run after exam end or via an admin "finish stale attempts" button, not only daily | `src/lib/cleanup.ts:14`, `vercel.json` cron | Sequential, daily, 60 s limit: abandoned attempts stay IN_PROGRESS up to 24 h |
| B13 | P1 | Startup env validation via `src/instrumentation.ts` (R2_*, TURNSTILE_*, CRON_SECRET, STORAGE_DIR); reject placeholder secrets; fail loudly if storage is local on multi-replica hosts | `src/lib/env.ts:3-14`, `src/lib/storage.ts:35-37` | Bad config only shows as a runtime 500 (today's upload failure) |
| B14 | P1 | `/api/health`: add a timeout, check storage/config | `src/app/api/health/route.ts` | A hung DB hangs the probe; config problems are invisible |
| B15 | P2 | Lockout DoS: bind lockout to (email, IP) or use exponential backoff; cap/hash rate-limit key length | student/admin login routes, `src/lib/rate-limit.ts` | An attacker can lock any student out on exam day; key bloat |
| B16 | P2 | Decide admin login: implement email OTP (wire `otp_codes`, `mail.ts`) or document "phone as password"; remove dead `SESSION_SECRET`/`otp_codes` if unused | `src/app/api/auth/admin/login/route.ts:23`, `src/lib/env.ts:6` | Plan requires OTP; phone numbers are low-entropy |
| B17 | P2 | Move document parsing off the web process (pg-boss worker) or add a timeout | `src/app/api/admin/documents/route.ts:68`, `answer-key/route.ts:80` | pdfjs/mammoth/exceljs block the event loop on a VPS |
| B18 | P2 | Paginate admin results; replace O(n^2) analytics with `groupBy` | `src/lib/results.ts:64-72`, `analytics/route.ts:18-20` | Admin polling competes with exam load |
| B19 | P2 | Score as Float if negative marking is ever enabled; unify the clock (DB `now()` for `expiresAt`) | `src/lib/attempts.ts:61`, `prisma/schema.prisma:180`, `start/route.ts:49` | Rounding breaks ties; replica clock skew |
| B20 | P2 | Add test close/unpublish (`CLOSED` is never set), question/option shuffle, audit-log retention, CSV export leading-space guard | `src/lib/csv.ts:42`, tests routes | Plan features missing / small gaps |

### B. Design: frontend, UX, accessibility
| # | Pri | Change | Where | Why |
|---|---|---|---|---|
| D1 | P0 | Auto-submit failure: blocking "Submitting, retrying..." state with a backoff loop until success | `src/components/TestRunner.tsx:160-188,380` | Failure is invisible, the timer sits at 00:00 and nothing retries |
| D2 | P0 | Start/list fetch: jittered auto-retry on 429/5xx/network, Retry button, 0-5 s start jitter with a "preparing" message, drop the duplicate list fetch | `TestRunner.tsx:78-115,233-244` | Dead-end "blocked" screen at 1000 simultaneous starts |
| D3 | P0 | Autosave: 401 -> sign-in prompt; distinct 429/5xx handling; exponential backoff; flush on `pagehide`/`visibilitychange`/`online` (keepalive); debounce max-wait | `TestRunner.tsx:119-148,191-199,225` | Unsaved answers lost on tab close; 401 retries forever |
| D4 | P1 | Timer: re-sync from autosave `serverNow` or `/api/time`, RTT compensation, no initial "00:00" flash, isolate the timer re-render | `TestRunner.tsx:63-64,109,175-188` | Drift after sleep/clock change; the whole runner re-renders every 500 ms |
| D5 | P1 | Submit in-flight guard; modal says "Time is up, submitting" and hides "Go back" during auto-submit | `TestRunner.tsx:151,380-392` | Click and auto-submit can overlap |
| D6 | P1 | Persist `marked` and `current` question across refresh | `TestRunner.tsx:61-62` | Review flags lost on resume |
| D7 | P1 | Mobile runner: sticky bottom nav/submit, collapsible palette, always-visible save state | `TestRunner.tsx:281,357-366,403-406` | Palette sits below the question; save badge is `hidden sm:flex` |
| D8 | P1 | Accessibility: fix contrast (white on cyan gradient, white on `amber-500`, small `emerald-600`), `focus-visible` on the palette, arrow-key radio + A-D/N/P shortcuts, keyboard-reachable result rows, tab keys on Segmented, `aria-pressed` on password toggle | `src/app/globals.css`, `src/components/ui.tsx:77-109`, `StudentTests.tsx:64`, `results/page.tsx:254` | WCAG AA failures, mouse-only controls |
| D9 | P1 | Add `error.tsx`, `loading.tsx`, `not-found.tsx` at app and admin level | `src/app/**` | Render errors show Next's default page |
| D10 | P1 | Maintenance indicator on the dashboard and test intro, not only after a failed start | `StudentTests.tsx`, `start/route.ts:43-46` | Students learn only from a generic error |
| D11 | P2 | Remove `style-src-attr 'unsafe-inline'`: replace ~35 inline `style={{}}` with classes/SVG/`progress`; add CSP `report-to` | `src/middleware.ts:7-21`, `admin.tsx`, `ui.tsx`, `results/page.tsx` | Tightens the CSP; violations are invisible today |
| D12 | P2 | Perf: disable decorative animation in the runner, split `"use client"` barrels, share the announcements fetch, paginate the results table, drop the unused mono font | `ui.tsx`, `admin.tsx`, `Announcements.tsx` | Jank on low-end phones; extra client JS |
| D13 | P2 | SEO/PWA basics (robots, titles, viewport/themeColor); math/image/code in questions; font-size control; admin audit-log viewer; consent notice | `src/app/**` | Plan features and polish |
| D14 | P2 | Disable the Vercel Toolbar (harmless CSP console noise); keep the CSP strict | Vercel settings | Console clutter only |

### C. Deploy and operations
| # | Pri | Change | Where | Why |
|---|---|---|---|---|
| P1 | P0 | Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` for Production and redeploy | Vercel env | Uploads return 503 today |
| P2 | P0 | `vercel.json`: set `regions` to the Neon region; `maxDuration` on hot/parsing routes; Pro plan if commercial | `vercel.json` | Default iad1 adds latency per query; Hobby is non-commercial with a 10 s limit |
| P3 | P0 | Resolve `npm audit`: Next 14.2.35 (critical advisories incl. App Router CSP-nonce XSS) -> plan a Next 15.x/16.x upgrade or document accepted risk + mitigations; `postcss` (high); `exceljs`/`uuid` (moderate) | `package.json` | Known CVEs; audit is `continue-on-error` |
| P4 | P0 | Node 20 (EOL) -> Node 22 LTS; add `engines`/`.nvmrc`; pin base images | `Dockerfile`, `package.json`, CI | Unsupported runtime |
| P5 | P0 | k6: wrap users at the seeded count, `VUS` default 1000, per-endpoint thresholds + `abortOnFail`, deadline-burst and login-storm scenarios, batched autosave, per-VU IP / raised `LOGIN_IP_LIMIT` on staging, distributed generators; seed script: prod-host guard, catch + non-zero exit | `scripts/loadtest/k6-exam.js:13,20,28`, `seed-load-students.ts:64-95` | The test as written cannot validate 1000 users |
| P6 | P1 | Replicas: compose scale / Railway replicas; Caddy upstreams with `health_uri`, `lb_try_duration`; R2 for uploads; Postgres tuning or PgBouncer; resource limits; `caddy depends_on app healthy` | `docker-compose.yml`, `Caddyfile:1-4` | Single replica today; a shared volume only works on one host |
| P7 | P1 | CI/CD: gate deploys on CI; automatic `prisma migrate deploy` job; build/push the image to GHCR (`deploy.yml` is referenced but missing; fix the `latest-tools` tag); enforce `npm audit`; coverage; CodeQL; Dependabot `github-actions` | `.github/workflows/ci.yml`, `docker-compose.yml:1,25` | A broken main can reach production; migrations are manual |
| P8 | P1 | Backups: off-site encrypted `pg_dump` for Neon/R2, restore script and tested drill, back up uploads from R2 | `scripts/backup.sh` | Script covers Docker volumes only; no restore checklist |
| P9 | P1 | Monitoring: Sentry + `src/instrumentation.ts`, uptime monitor, 5xx/429 alerts, structured logs | new | `console.*` only |
| P10 | P1 | Secrets: reject placeholder values, don't load the entire `.env` into the app container, change `POSTGRES_PASSWORD=change-me`, document rotation (`DOB_PEPPER` is not rotatable) | `.env.example`, `docker-compose.yml:52` | Placeholders pass validation |
| P11 | P2 | Neon: pooled URL (`-pooler`) in `DATABASE_URL`, direct in `DIRECT_URL`, scale-to-zero off and a larger compute on exam day, same region as the app | Neon/Vercel/Railway dashboards | Cold starts and connection limits |
| P12 | P2 | Docs: fix `DEPLOY.md` (A2.6 false claims about `vercel.json`/deploy workflow, garbled line 126, V6/V4 OTP + Brevo contradictions, `db:seed` env-file, DATABASE_URL params) and the `README.md:15` OTP mention | `DEPLOY.md`, `README.md` | Docs disagree with code |

### D. Testing
| # | Pri | Change | Why |
|---|---|---|---|
| T1 | P0 | Integration tests on Postgres (CI already starts one): `finalizeAttempt` idempotency/concurrency, autosave-vs-submit race, unique attempt, rate-limit SQL, session revoke | Core exam integrity is untested |
| T2 | P1 | Route-level authz/IDOR tests (student A vs B attempt, admin routes without a session), CSRF/origin, expired-attempt rejection, cron auth, middleware | None of the 34 routes is tested |
| T3 | P1 | Playwright e2e per plan (admin upload -> publish; student completes; scores match) and security cases (no keys before release, XSS rendered as text) | The plan's verification list is unimplemented |
| T4 | P2 | `prisma migrate diff` drift check in CI; ESLint 8 -> supported version; coverage config | Hygiene |

## Environment variables
```
DATABASE_URL, DIRECT_URL            # Neon pooled and direct
SESSION_SECRET, DOB_PEPPER          # long random strings
BREVO_API_KEY, MAIL_FROM
TURNSTILE_SITE_KEY, TURNSTILE_SECRET
GEMINI_API_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET
SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE
```
Never commit `.env`; set these in the host's dashboard.

## Accounts to create first
GitHub, Vercel, Neon, Cloudflare (R2 + Turnstile), Brevo, Google AI Studio (Gemini key). All free to sign up.

## Project structure
```
src/app/(student)/login, dashboard, test/[id], result/[id]
src/app/admin/login, students, documents, tests, tests/[id]/results, announcements
src/app/api/...                      # about 39 endpoints
src/components/AnnouncementBanner, WhatsNewDialog
src/lib/auth, session, rate-limit, scoring, csv
src/lib/parsers/docx, pdf, xlsx, template, gemini
prisma/schema.prisma, seed.ts
tests/unit, e2e, security
```

## Announcements, "What's New" and maintenance mode
In-app notices such as "App launched today" or "Staff are busy / scheduled maintenance", plus a Play Store style "what changed" message. Free and needs no extra service.
- **Banner**: admin writes a notice (title, message, type `INFO | MAINTENANCE | WARNING | RELEASE_NOTE`, audience `STUDENT | ADMIN | ALL`, start and end time). Shown as a dismissible banner on the login page (safe public notices only), student dashboard and admin panel.
- **What's New dialog**: a `RELEASE_NOTE` announcement shows once as a modal after login, then is remembered as seen per user.
- **Maintenance mode**: a flag that shows a message and blocks starting new tests (running attempts continue).
- **Later (optional)**: email students when a test is assigned (Brevo); web push via a PWA. Play Store style push does not apply because this is a web app.
- **Security**: body is plain text (React-escaped, no HTML), length cap, admin-only writes with audit log, public endpoint exposes only audience ALL and no user data.

## Database schema
- `admins(id, email UNIQUE NOT NULL, phone UNIQUE NOT NULL, name)` (phone normalized, E.164)
- `students(id, email UNIQUE NOT NULL, roll_no UNIQUE, name, dob_hash, batch)` (DOB stored as HMAC with a server pepper)
- `sessions(id_hash, user_type, user_id, expires_at, revoked_at)`
- `otp_codes(admin_id, code_hash, expires_at, attempts, used_at)`
- `rate_limits(key, count, window_start, locked_until)`
- `documents(id, filename, path, mime, status, uploaded_by, created_at)`
- `tests(id, title, document_id, duration_min, total_marks, negative_marking, start_at, end_at, status[DRAFT|PUBLISHED|CLOSED], results_released_at)`
- `questions(id, test_id, text, options JSONB, correct_option, marks, explanation, order, confidence)`
- `test_assignments(test_id, student_id)`
- `attempts(id, test_id, student_id, started_at, expires_at, submitted_at, score, status)` UNIQUE(test_id, student_id)
- `answers(attempt_id, question_id, selected_option, is_correct, answered_at)`
- `announcements(id, title, body, type, audience, starts_at, ends_at, is_active, created_by)`
- `announcement_dismissals(announcement_id, user_type, user_id, dismissed_at)`
- `audit_log(id, actor, action, meta, at)`

## API endpoints (about 39 total)
**Auth (5)**
- `POST /api/auth/student/login` {email, dob} or {email, rollNo} (exactly one, Zod-validated)
- `POST /api/auth/admin/otp/request` {email, phone}
- `POST /api/auth/admin/otp/verify` {email, otp}
- `POST /api/auth/logout`
- `GET /api/auth/me`

**Student (7)**
- `GET /api/student/tests` : assigned/available tests
- `POST /api/student/tests/:id/start` : create/resume attempt, returns questions (no answers) + `expires_at`
- `PUT /api/student/attempts/:id/answers` : autosave
- `POST /api/student/attempts/:id/submit` : idempotent
- `GET /api/student/attempts/:id/result` : only after release
- `GET /api/student/results` : history
- `POST /api/student/attempts/:id/events` : tab-switch log (optional)

**Admin (21)**
- Students (5): `GET/POST /api/admin/students`, `POST /api/admin/students/import` (CSV), `PATCH/DELETE /api/admin/students/:id`
- Documents (3): `POST /api/admin/documents`, `GET /api/admin/documents/:id` (parse status), `GET /api/admin/documents`
- Questions (4): `GET /api/admin/tests/:id/questions`, `POST/PATCH/DELETE /api/admin/questions/:id`
- Tests (6): `POST /api/admin/tests`, `GET /api/admin/tests`, `PATCH /api/admin/tests/:id`, `POST /api/admin/tests/:id/publish`, `POST /api/admin/tests/:id/assign`, `POST /api/admin/tests/:id/release`
- Results (4): `GET /api/admin/tests/:id/results` (ranked), `GET /api/admin/attempts/:id` (detail), `GET /api/admin/tests/:id/analytics`, `GET /api/admin/tests/:id/export`
- Attempt control (1): `POST /api/admin/attempts/:id/reset` (allow retake)

**Announcements (6)**
- `GET /api/announcements` (active for the current user; public variant returns only audience ALL, non-sensitive notices)
- `POST /api/announcements/:id/dismiss`
- Admin: `GET/POST /api/admin/announcements`, `PATCH/DELETE /api/admin/announcements/:id`

Optional extras: `GET /api/time` (server clock for the timer) and `GET /api/health`.

## Pages
- Student: `/login`, `/dashboard`, `/test/[id]` (timer, navigator, autosave), `/result/[id]`.
- Admin: `/admin/login` (email, phone, OTP), `/admin`, `/admin/students`, `/admin/documents` (upload + review), `/admin/tests`, `/admin/tests/[id]/results` (table, charts, drill-down), `/admin/announcements`.

## Security requirements (OWASP-aligned)
**Authentication and sessions**
- Session in an httpOnly, Secure, SameSite=Strict cookie, backed by a server-side `sessions` table (hashed session id) so logout and revoke really work. Rotate the session on login. Separate cookie names for student and admin.
- Student session lifetime = test duration + buffer. Admin: 1-2 h idle timeout, 8 h absolute.
- **Student login**: rate limit per IP and per email, exponential lockout, Turnstile CAPTCHA after 3 failures, identical error and similar timing whether the email exists or not, constant-time comparison.
- **Admin OTP**: 6 digits, stored hashed, 5-min expiry, single use, max 5 attempts, resend throttle. Generic errors; never reveal whether an admin exists.

**Authorization**
- Role check in every handler, object-level ownership checks (`attempt.student_id == session.studentId`, test assigned to the student), deny by default. Prevents IDOR.
- Never send `correct_option` or explanations to the browser before results are released.

**Integrity**
- Submit is idempotent and runs in a transaction with a row lock. Answers after `expires_at` (plus 5 s grace) are rejected. Unique (test_id, student_id).

**Input and output**
- Zod validation on every body, query and param; reject unknown fields.
- Prisma parameterized queries only; any raw SQL must be parameterized.
- Render question and announcement text as plain text. No `dangerouslySetInnerHTML`; if rich text is ever needed, sanitize with DOMPurify. Strip HTML, images and scripts from parsed documents.
- CSV export neutralizes formula injection (prefix cells starting with `= + - @`). CSV import has size and row limits, email validation and de-duplication.

**Uploads and parsing**
- Magic-byte check, 4 MB limit, random server-generated filenames, stored in private R2 storage and never served directly.
- Guard against zip bombs (DOCX/XLSX are zips): cap uncompressed size and entry count. Page limit for PDFs.

**Transport, headers, CSRF**
- HTTPS only with HSTS. Strict nonce-based CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`.
- CSRF: SameSite=Strict + Origin/Host check + custom header on state-changing requests. CORS same-origin only.

**Secrets, infrastructure, data**
- Secrets only in environment variables, never committed (`.env` in `.gitignore`). Gemini and Brevo keys are server-side only. Rotate keys.
- Database not exposed publicly (use the provider's pooled, TLS connection), least-privilege DB user. On a VPS: non-root minimal Docker image, firewall allows 80/443 only.
- Encrypted backups. PII minimization, retention policy and deletion process, with a consent notice on first login.

**Logging and monitoring**
- Audit log for login success/failure, uploads, publish, release, resets, exports, announcements. No secrets or full PII in logs. Generic error pages in production (no stack traces).

**Supply chain**
- Lockfile committed, `npm audit` in CI, Dependabot, pinned versions.

## Build phases (about 18 days)
1. **Foundation (Day 1-2)**: Next.js scaffold (patched version), Prisma schema + migrations on Neon, seed admin, sessions, rate-limit table, security headers, auth helpers.
2. **Auth and admin core (Day 3-5)**: student login (rate limit + Turnstile), admin OTP login, student CSV import, test CRUD, manual question CRUD.
3. **Document pipeline (Day 6-8)**: secure upload to R2, parsers, template parser + Gemini fallback, review UI, publish.
4. **Student flow (Day 9-12)**: dashboard, test runner (timer, autosave, resume), submit, scoring, result page.
5. **Analytics and announcements (Day 13-15)**: results table, ranking, charts, per-question accuracy, CSV export, release and reset, announcements, What's New dialog, maintenance mode.
6. **Hardening and deploy (Day 16-18)**: authorization test suite, OWASP ZAP scan, dependency audit, load test (1000 users), deploy, backups.

## Verification
- Unit: scoring (negative marking, unanswered), parser on sample PDF/DOCX fixtures.
- Integration: login, start, autosave, submit, result via API tests.
- E2E (Playwright): admin uploads a sample DOCX, reviews, publishes; student completes; both see the correct score.
- **Security tests**: a student cannot reach admin routes or another student's attempt; brute-force lockout works; fake-extension and zip-bomb uploads are rejected; an XSS payload in a question or announcement is rendered as text; correct answers never appear in any student-facing network response before release; logout invalidates the session server-side; OWASP ZAP baseline scan is clean.
- Announcements: a scheduled notice appears and expires on time; a dismissed notice stays dismissed; maintenance mode blocks `start` but not autosave or submit.
- Edge cases: refresh mid-test resumes with correct remaining time; auto-submit at expiry; second attempt blocked; double submit is harmless.
- Load: k6 with about 1000 concurrent autosaving users, including a deadline-burst submit scenario.
