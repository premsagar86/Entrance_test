# Aptitude Test Platform — Architecture & Build Plan (free stack, security-hardened)

## Context
Build a web platform where students log in with **Email + Date of Birth, or Email + Roll No**, take a timed aptitude test, and see results. An **Admin** logs in with **Email + Phone + email OTP**, uploads question documents, publishes tests, views every student's score and performance, and posts announcements.

Decisions: **Next.js 14 (full-stack, TypeScript) + PostgreSQL**, scale **under 500 concurrent users**, **all-free tools**. Students and admins live in **separate tables** (different credentials, data and lifecycles; stronger isolation).

## Decisions (resolved)
1. **Hosting**: commercial status unknown, so **Option B (self-hosted VPS: Docker Compose + Caddy)** is the primary deployment. Option A (Vercel Hobby) is non-commercial only and has a 10 s function limit.
2. **Marking**: no negative marking (column kept, default 0). 1 mark per question by default.
3. **Results**: shown instantly after submit (`results_released_at` set on submit). Admin can optionally hold results per test. Correct answers are hidden unless the admin enables it.
4. **Admin OTP**: by email (Resend free tier). Default, not yet confirmed.
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
9. **Anti-cheating (optional)**: shuffle questions and options, tab-switch logging. A deterrent, not a security control.
10. **Announcements and "What's New"** (see below).

## Free tech stack

| Layer | Choice | Notes |
|---|---|---|
| App (UI + API) | Next.js 14 (patched, at least 14.2.25) + TypeScript | one codebase for both panels |
| Styling | Tailwind CSS + shadcn/ui | |
| Database | **Neon Postgres** (or Supabase) | use the pooled connection string |
| ORM | Prisma | parameterized queries |
| File storage | **Cloudflare R2** (or Supabase Storage) | uploads, never public |
| Email (OTP, notices) | **Resend** (or Brevo / Gmail SMTP) | free tier |
| Bot protection | **Cloudflare Turnstile** | free CAPTCHA |
| AI extraction | **Google Gemini API (free tier)** | also reads scanned PDFs/images, so no OCR library needed |
| Parsing | mammoth (DOCX), pdfjs-dist (PDF), xlsx (XLSX/CSV) | |
| Validation / sessions | Zod, `jose`, Node `crypto` | |
| Charts | Recharts | |
| Testing | Vitest, Playwright, k6 | |
| CI / alerts | GitHub Actions, Dependabot | |

The Claude API is paid, so Gemini's free tier replaces it. The regex template parser needs no AI at all.

## Document → Questions extraction
Uploaded files are untrusted and arbitrarily formatted, so the **admin review step is a mandatory gate**.

1. **Upload and validate**: allow only pdf, docx, txt, csv, xlsx, png, jpg. "Any file type" is **not** allowed. Reject macro formats (docm, xlsm), executables and archives. Check magic bytes, not just extension or MIME. 10 MB limit.
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
                                               Resend (email OTP)          Turnstile (CAPTCHA)
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

**Expectation**: 500 simultaneous students is heavy for free tiers. Load-test early and keep a fallback (Option B or a small paid database) for exam day.

## Environment variables
```
DATABASE_URL, DIRECT_URL            # Neon pooled and direct
SESSION_SECRET, DOB_PEPPER          # long random strings
RESEND_API_KEY, MAIL_FROM
TURNSTILE_SITE_KEY, TURNSTILE_SECRET
GEMINI_API_KEY
R2_ACCOUNT_ID, R2_ACCESS_KEY, R2_SECRET_KEY, R2_BUCKET
SEED_ADMIN_EMAIL, SEED_ADMIN_PHONE
```
Never commit `.env`; set these in the host's dashboard.

## Accounts to create first
GitHub, Vercel, Neon, Cloudflare (R2 + Turnstile), Resend, Google AI Studio (Gemini key). All free to sign up.

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
- **Later (optional)**: email students when a test is assigned (Resend); web push via a PWA. Play Store style push does not apply because this is a web app.
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
- Magic-byte check, 10 MB limit, random server-generated filenames, stored in private R2 storage and never served directly.
- Guard against zip bombs (DOCX/XLSX are zips): cap uncompressed size and entry count. Page limit for PDFs.

**Transport, headers, CSRF**
- HTTPS only with HSTS. Strict nonce-based CSP with `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy`.
- CSRF: SameSite=Strict + Origin/Host check + custom header on state-changing requests. CORS same-origin only.

**Secrets, infrastructure, data**
- Secrets only in environment variables, never committed (`.env` in `.gitignore`). Gemini and Resend keys are server-side only. Rotate keys.
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
6. **Hardening and deploy (Day 16-18)**: authorization test suite, OWASP ZAP scan, dependency audit, load test (500 users), deploy, backups.

## Verification
- Unit: scoring (negative marking, unanswered), parser on sample PDF/DOCX fixtures.
- Integration: login, start, autosave, submit, result via API tests.
- E2E (Playwright): admin uploads a sample DOCX, reviews, publishes; student completes; both see the correct score.
- **Security tests**: a student cannot reach admin routes or another student's attempt; brute-force lockout works; fake-extension and zip-bomb uploads are rejected; an XSS payload in a question or announcement is rendered as text; correct answers never appear in any student-facing network response before release; logout invalidates the session server-side; OWASP ZAP baseline scan is clean.
- Announcements: a scheduled notice appears and expires on time; a dismissed notice stays dismissed; maintenance mode blocks `start` but not autosave or submit.
- Edge cases: refresh mid-test resumes with correct remaining time; auto-submit at expiry; second attempt blocked; double submit is harmless.
- Load: k6 with about 500 concurrent autosaving users.
