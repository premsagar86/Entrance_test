# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Timed MCQ entrance exams: admins upload question documents, review, publish and assign tests, and view ranked results; students on a pre-registered roster take server-timed tests. Next.js 14 App Router, TypeScript, Prisma + PostgreSQL, Tailwind. The app is live on Vercel, and **handling 1000 concurrent students is a project requirement** (not yet proven by a load test).

## Commands

```bash
npm ci --legacy-peer-deps      # the flag is also used by CI, Vercel and Docker
cp .env.example .env           # DATABASE_URL, DIRECT_URL, SESSION_SECRET, DOB_PEPPER, SEED_ADMIN_*
npx prisma migrate deploy
npm run db:seed                # create/update the admin
npm run db:demo                # demo data
npm run dev                    # http://localhost:3000

npm run lint
npm run typecheck
npm test                                       # Vitest, tests/unit/**/*.test.ts only
npx vitest run tests/unit/scoring.test.ts      # one file
npx vitest run -t "part of the test name"      # by name
npm run build                                  # run `npx prisma generate` first on a fresh checkout or after schema changes

npm run cleanup                # finalize abandoned attempts, purge old rows (reads .env)
```

CI (`.github/workflows/ci.yml`, Node 22) validates the schema, applies migrations to an empty Postgres, then runs lint, typecheck, tests and build.

Scripts that use `.env` act on whatever database it points to; check the target before running migrations, seeds or cleanup. For load testing (`loadtest:seed`, `scripts/loadtest/k6-exam.js`, then `loadtest:verify`), follow `BUILD_PLAN.md` step 7: staging only, with the host's permission, and a new test per run. `expectedOption` is duplicated in the k6 script and `verify-results.ts`; keep them identical. `loadtest:seed -- --clean` is likely to fail once seeded students have attempts, because that foreign key restricts deletion.

## Architecture

One Next.js app serves both the pages and the API (`src/app/api/**`) on a single origin. `src/lib` holds the server logic. `@/` maps to `src/` (also configured in Vitest).

### Request security
- Students and admins have separate cookies (`at_student`, `at_admin`) backed by hashed tokens in the `sessions` table (`src/lib/session.ts`). A new login revokes that user's earlier sessions. This is not JWT, and `SESSION_SECRET` is validated by `env.ts` but not used to sign sessions.
- `src/middleware.ts` only checks that a cookie **exists** before showing a page. Every API handler must call `requireStudent()` / `requireAdmin()` itself.
- State-changing requests must pass `assertSameOrigin`: matching `Origin`/`Host` **and** `x-requested-with: fetch`. `parseJson` (`src/lib/http.ts`) does this and also applies a body size cap and Zod validation; handlers without a JSON body call `assertSameOrigin` directly. Browser code should go through `src/lib/client-api.ts`, which sends the header.
- Handler pattern: `try { assertSameOrigin / parseJson, require*, parseParam, ... } catch (e) { return handleError(e) }`, throwing `HttpError` for expected failures.
- Middleware sets a per-request CSP nonce. The root layout calls `headers()` so pages render dynamically and receive it. New external scripts, styles or connections need a CSP change in the middleware.
- Admin sign-in is email + phone number (the phone acts as the password). Students sign in with email + DOB or roll number. DOBs are stored as an HMAC with `DOB_PEPPER`, which must never change once students exist.

### Exam lifecycle (spans several files)
- **Publish** (`api/admin/tests/[id]/publish`) requires a valid answer key on every question and fixes `totalMarks`.
- **Start** (`api/student/tests/[id]/start`) checks assignment and window, creates the single attempt per (test, student), sets `expiresAt` on the server (capped at the test's `endAt`), and resumes on repeat calls. A maintenance announcement blocks only new attempts. `correctOption` and `explanation` must never be sent here.
- **Autosave** (`api/student/attempts/[id]/answers`) writes a batch in one raw SQL upsert, guarded by `status = 'IN_PROGRESS'`. The client side, including retry with jitter, is `src/components/TestRunner.tsx`.
- **Finalize**: all scoring that changes state goes through `finalizeAttempt` (`src/lib/attempts.ts`), which locks the attempt row and is idempotent. It is reached from submit, from lazy expiry on later requests (after `GRACE_MS`), and from cleanup. `scoreAttempt` (`src/lib/scoring.ts`) is pure.
- **Result visibility** depends on `holdResults`, `resultsReleasedAt` and `showAnswers`. The student result route reads the stored score and does not write.
- Ownership checks go through `src/lib/student-access.ts`, which returns the same 404 for missing and other students' attempts. `loadAttemptLite` is for hot paths.

### Performance constraints
Autosave, start and session checks are the hot paths; avoid adding database queries or writes to them.
- `session.ts` (student sessions only), `question-cache.ts` and `announcements.ts` cache in process memory, and `mem-limit.ts` rate-limits there. Production runs multiple serverless instances, so none of this is shared: revocations and edits arrive after a TTL, and limits are approximate.
- `rate-limit.ts` is the shared limiter, stored in Postgres. Use it where the limit must hold across instances.
- Raw SQL uses the mapped snake_case table and column names from `prisma/schema.prisma`.
- Migrations are applied manually, not by the Vercel build, so keep them backward-compatible. A push to `main` may deploy to the live app.

### Document ingestion
`api/admin/documents` -> `lib/upload/validate.ts` (type checks, 4 MB limit) -> `lib/storage.ts` (Cloudflare R2 when all `R2_*` are set, otherwise local `STORAGE_DIR`; R2 is required on Vercel) -> `lib/parsers`. The deterministic template parser runs first; Gemini is an optional fallback for unmatched text, scanned PDFs and images. An upload creates a draft test. `pdfjs-dist`, `mammoth` and `exceljs` are excluded from bundling in `next.config.mjs`.

## Deployment notes
- `clientIp()` trusts only the header named by `CLIENT_IP_HEADER` (default `x-real-ip`), which the hosting proxy must overwrite (see `Caddyfile`).
- Timestamps are stored in UTC and some raw SQL uses `now()`, so the database timezone must be UTC. A local Postgres on another timezone makes expiry and rate limits behave wrongly.

## Known issues (remove each once fixed)
- Next.js 14.2.35 has critical advisories with no fix in 14.x (`BUILD_PLAN.md` section 1).

## Documentation
- `BUILD_PLAN.md` is the current plan: Railway + Neon + R2 + Turnstile. The user wants one tool per job, explained in plain language. The app live today is still on Vercel.
- `DEPLOY.md`, `CLOUDFLARE.md` and `plan.md` are older references; check the code before relying on them.
