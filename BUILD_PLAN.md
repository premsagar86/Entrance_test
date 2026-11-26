# Build and Deployment Plan: Aptitude Test Platform

This is the complete plan to build, deploy and run the application. Prepared 2026-11-26.

**Goal:** 1000 students taking a test at the same time. **This is not proven until Step 7 passes.** The plan targets 2 days; it cannot promise zero errors.

---

## What you are building

An online aptitude test platform with two kinds of users.

| Admin can | Student can |
|---|---|
| Sign in | Sign in with email + date of birth, or email + roll number |
| Add or import students and group them in batches | See assigned tests |
| Upload question papers, then check and correct the questions and answer key | Take a timed test with autosave |
| Create, publish and assign tests | Submit, or have the test closed after time runs out |
| See results, analytics and exports, and reset an attempt | See results when they are available |
| Hold or release results, and post announcements | See profile, past results, announcements and help |

| Part of the application | What it handles | Stored data |
|---|---|---|
| Sign-in | Student and admin sessions, login limits | `students`, `admins`, `sessions`, `rate_limits` |
| Documents | Upload, reading questions from files | `documents` (the files are in R2) |
| Tests | Questions, answer key, timing, assignments | `tests`, `questions`, `test_assignments` |
| Exam | Start, autosave, submit, scoring, tab-switch records | `attempts`, `answers`, `attempt_events` |
| Announcements | Messages and maintenance mode | `announcements`, `announcement_dismissals` |
| Audit | A record of important actions | `audit_log` |

| Folder | Contains |
|---|---|
| `src/app` | Screens, and the backend under `src/app/api` |
| `src/components` | Reusable screen parts, including the test screen |
| `src/lib` | Backend rules: sessions, security, exam, scoring, file reading |
| `prisma` | Database design and database change files |
| `scripts` | Cleanup and load testing |
| `tests` | Unit tests |

---

## 1. Blocker: Next.js security update (decide first)

The app uses Next.js **14.2.35**, the last 14.x release. `npm audit --omit=dev` (run 2026-11-26) reports **critical** problems in it, and the fixes are only in newer major versions (**15.5.29 or later**).

| Finding | What is known |
|---|---|
| Remote code execution through the image service (AVIF / SVG files) | The app does not use Next.js images, but the image service **is active** on a self-hosted build (checked locally). Whether this app's settings can actually be exploited has **not** been determined |
| Remote code execution on Windows-hosted servers | Does not apply to Railway, which runs this app on Linux. Do not expose a Windows-hosted copy to others |
| Other items (denial of service, request forgery, caching) | Not individually assessed |

**Recommendation: upgrade to Next.js 15.5.29 or later before any real exam on Railway.** It changes how cookies, headers and route parameters are read, so all checks and the rehearsal must be repeated. This work may take the plan beyond 2 days. **The app now live on Vercel uses the same version**; whether Vercel's platform blocks these problems has not been checked.

---

## 2. The tools (one per job)

| Job | Tool | Why this one |
|---|---|---|
| Screens and backend | Next.js + React + TypeScript | The app is already written in it: one codebase, one web address |
| Styling | Tailwind CSS | Already used |
| Input checking | Zod | Already used |
| Database access | Prisma | Already used, including database change files (migrations) |
| Database | Neon PostgreSQL | Keeps answers and scores consistent; handles many connections through its pooler |
| Hosting | Railway Pro | Runs the app's `Dockerfile`; you set a fixed number of copies, so database connections are predictable; it publishes a k6 load-testing guide |
| Uploaded files | Cloudflare R2 | Already supported by the code |
| Login bot check | Cloudflare Turnstile | Already in the code |
| Code and automatic checks | GitHub + GitHub Actions | Already set up |
| Unit tests | Vitest | Already set up |
| Load test | k6 | The test script already exists |

Do not add anything else. You do not install Docker: Railway builds the `Dockerfile`. Leave `GEMINI_API_KEY` empty and upload text-based DOCX, PDF or XLSX files. Keep the current Vercel app unchanged as the fallback until Railway passes.

**Why finish the existing code instead of rebuilding:** sign-in, students, document upload, tests, autosave, submit, scoring and results already exist. A rebuild in 2 days would replace them with new, untested code.

---

## 3. Design

```
        Students and admins (browser)
                    |  HTTPS
                    v
   RAILWAY (Singapore): 3 copies of the app
   screens + /api in the same app
          |                    |
          v                    v
   NEON POSTGRESQL      CLOUDFLARE R2
   (Singapore)          (uploaded files)

   Cloudflare Turnstile: checks each sign-in
   Railway cron service: closes abandoned exams
```

| Design rule | How it works |
|---|---|
| Any copy can serve any student | Sessions, attempts and answers are in the database |
| Nobody can extend the timer | The server sets and enforces the deadline |
| Answers are saved during the test | The browser autosaves about every 10 seconds and retries |
| Submitting twice is safe | The attempt is locked and scored once |
| Students cannot see the answer key early | The start request never sends correct answers |

Each copy keeps short-lived caches in memory, so a logout can take up to 30 seconds to reach other copies, and autosave limits are counted per copy. Do not edit a test's questions during its exam.

**The database is the most likely weak point**, especially when everyone submits together.

**Region:** Singapore for both, assuming students are in India. If your live Neon database is in another region, choose the nearest Railway region instead; do not move data during these 2 days.

---

## 4. What is already done (2026-11-26, local only, not committed or deployed)

| Item | Result |
|---|---|
| Per-IP login limits could be bypassed with a faked header | Fixed in `src/lib/http.ts` (uses `X-Real-IP`; see Step 4 check) |
| One bad attempt stopped all cleanup | Fixed; failures are counted and the cleanup request returns an error status |
| Load test did not check saved data | Predictable answers, a read-back check before submit, and `npm run loadtest:verify` |
| CI used Node 20, `Dockerfile` Node 22 | CI now uses 22 |
| Lint, type check, 58 unit tests, build | All pass (Windows, Node 24) |
| Local rehearsal, 100 students, temporary database | 100 of 100 submitted, 800 saved answers and all scores correct, no failed requests. A deliberately changed answer was detected |

**What the rehearsal does not show:** it ran on one computer with one app copy, using a script that follows the k6 steps (k6 is not installed). Its slowest 5% of logins took about 3.3 s when all 100 arrived at once, above the 2 s target. It says nothing reliable about 1000 users on Railway. The Docker image, the GitHub checks with Node 22 and the real k6 run have **not** been run.

---

## 5. Settings

### Environment variables (Railway app service)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL (host has `-pooler`) with `?sslmode=require&pgbouncer=true&connection_limit=10&pool_timeout=20` |
| `DIRECT_URL` | Neon **direct** URL |
| `SESSION_SECRET` | New random value, 32+ characters |
| `DOB_PEPPER` | 32+ characters. **For existing student data, copy the current value exactly. Never change it** |
| `CRON_SECRET` | New random value, 32+ characters |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | From Cloudflare R2. All four are required |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key. Used while building: redeploy after changing it |
| `TURNSTILE_SECRET` | Turnstile secret key |
| `LOGIN_IP_LIMIT` | `3000` |
| `CLIENT_IP_HEADER` | Leave empty |

Random value (run once for each):
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Never commit or share these values.

### Railway service settings (set them in the dashboard)

Railway says its settings files such as `railway.json` are **deprecated**, and existing ones keep working for older services only **until 2026-12-01**. Do not rely on the file. Set and check these yourself:

| Setting | Value |
|---|---|
| Plan | Pro |
| Build | From the repo's `Dockerfile` |
| Region | Southeast Asia (Singapore) |
| Replicas | 3 |
| Health check path | `/api/health` (Railway uses it **only while deploying**) |
| Restart policy | On failure |
| Sleeping / serverless option | Off |

### Neon

Paid plan. Start with about **2 CU** and **scale-to-zero off** during tests and exams; the load test decides the final size. Between exams you may turn scale-to-zero on to save money (the first visit is then slower). In the SQL editor, `SHOW timezone;` must show a UTC setting such as `GMT` or `UTC`: the app stores times in UTC.

---

## 6. Steps

### Day 1: staging (a practice copy)

**Step 1. Decide and finish the Next.js upgrade** (section 1).

**Step 2. Check the code.**
```powershell
npm ci --legacy-peer-deps
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
```
Done when all pass. Then commit on a branch and open a pull request. **Check whether a push or merge to `main` updates your live Vercel app before merging.** Done when the GitHub `verify` check passes.

**Step 3. Create accounts and ask about load testing.** Enable Railway Pro and Neon paid. Email `abuse@railway.com`: you are testing your own app with up to 1000 virtual students, and give the date, duration, target address, expected peak requests and where the test runs from. Keep the reply.

**Step 4. Build staging.**
1. Neon: a **new, empty** database in Singapore.
2. R2: a separate private bucket with its own token.
3. Railway: a new project (or separate environment) from your GitHub branch, with the settings in section 5. Staging only, use Turnstile test keys: site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`. Set `LOGIN_IP_LIMIT=10000`.
4. Create tables and the first admin from your computer. Check the database host in the output: it must be **staging**.
   ```powershell
   $env:DATABASE_URL="<staging direct url>"; $env:DIRECT_URL=$env:DATABASE_URL
   npx prisma migrate deploy
   $env:SEED_ADMIN_EMAIL="<email>"; $env:SEED_ADMIN_PHONE="<8-15 digits, hard to guess>"
   npx tsx prisma/seed.ts
   Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PHONE
   ```
5. Generate a Railway web address and open `/api/health`. Expected: `{"status":"ok"}`.

**Step 5. Check that a visitor cannot fake their IP address.** On staging, make one sign-in request with a false address:
```powershell
$u="https://<staging address>"
'{"email":"nobody@example.test","rollNo":"X","turnstile":"XXXX.DUMMY.TOKEN.XXXX"}' | curl.exe -s "$u/api/auth/student/login" -H "content-type: application/json" -H "x-requested-with: fetch" -H "origin: $u" -H "x-real-ip: 203.0.113.50" --data-binary "@-"
```
In Neon run `SELECT key FROM rate_limits WHERE key LIKE 'stu:ip:%';`.
- **Pass:** the key shows your real public IP address.
- **Stop:** it shows `203.0.113.50`, a Railway internal address or `unknown`. Railway's documentation names `X-Real-IP` but does not say whether it replaces a value sent by the visitor.

**Step 6. Smoke test.**

| # | Action | Expected |
|---|---|---|
| 1 | Admin signs in with email + phone | Admin panel opens |
| 2 | Add a test student | Listed |
| 3 | Upload a small DOCX, PDF and XLSX (under 4 MB) | Questions are read; files appear in R2 |
| 4 | Set answers, duration and window; assign; publish | Published |
| 5 | Student signs in and starts | Questions and timer appear |
| 6 | Answer, wait 15 seconds, refresh | Answers remain |
| 7 | Submit | Works; result follows the release setting |
| 8 | Admin views and exports results | Score is correct |

**Cleanup service:** create a **second** Railway service from the Docker image `curlimages/curl`, not from the repo. Check that it has 1 replica and no health check. Variables: `CRON_SECRET` (same value as the app) and `APP_URL`. Start command:
```bash
sh -c 'curl -fsS --max-time 120 -H "Authorization: Bearer $CRON_SECRET" "$APP_URL/api/cron/cleanup"'
```
Set its cron schedule around your exam hours. Railway uses **UTC**, with at least 5 minutes between runs. Example for a 10:00 to 12:00 India-time exam: `*/5 4-7 * * *` (09:30 to 13:25 India time, every day). It closes attempts more than 10 minutes past their deadline, so widen the hours if your exams move. Frequent runs keep Neon awake. Run it once manually and check that it succeeds.

### Day 2: load test and go live

**Step 7. Load test staging** (only after Step 3 is answered). Install k6. Increase in stages: **20, then 200, then 1000 students, then 1000 again.**

**Each run needs a new published test**, because a student can attempt a test only once. Give it realistic questions and a window and duration longer than the run. For each run, set `$n` and `$id`:
```powershell
$n=20; $id="<new test id>"
$env:DATABASE_URL="<staging direct url>"; $env:DIRECT_URL=$env:DATABASE_URL
$env:DOB_PEPPER="<staging pepper>"; $env:ALLOW_LOADTEST_SEED="yes"
npm run loadtest:seed -- $id $n
k6 run -e BASE_URL=https://<staging address> -e TEST_ID=$id -e VUS=$n scripts/loadtest/k6-exam.js
npm run loadtest:verify -- $id $n
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:DOB_PEPPER, Env:ALLOW_LOADTEST_SEED
```
These scripts also read `.env`, but values set in the terminal take priority. **Confirm the printed database host is staging.**

| Pass check (both 1000-student runs) | Target |
|---|---|
| Failed requests | Under 1%, and every 5xx explained |
| Slowest 5%: login / start | Under 2 s / 2.5 s |
| Slowest 5%: autosave / submit | Under 500 ms / 3 s |
| Students finishing | k6 requires over 99%; the data check below requires **all** |
| `answers_intact` | 100% |
| `loadtest:verify` | `PASSED` |

The script spreads sign-ins and starts over 60 seconds and has everyone submit together. If your students all start in the same second, change the script first. If your computer or network cannot generate the load, run k6 as a separate Railway service, following [Railway's k6 guide](https://railway.com/guides/load-test-k6).

If a run fails, change **one** thing and repeat: check regions; then Neon CPU and size; then connection errors and `connection_limit` (3 copies x 10 = 30); then app CPU, memory and replicas.

**Afterwards, delete the whole staging database.** `loadtest:seed -- --clean` is likely to fail once students have attempts.

**Step 8. Production.**
1. Choose a time with **no exams**. Back up the database:
   `pg_dump "<direct url>" -Fc -f "D:\backups\before-golive.dump"` (the folder must exist; use client tools at least as new as the database; keep the file private).
2. For existing data, keep the **same database, R2 bucket and `DOB_PEPPER`**. For a new system, create them and run Step 4.4 against production. For existing data run only `npx prisma migrate status`, and apply pending migrations deliberately.
3. Create the production Railway service with **real** Turnstile keys and `LOGIN_IP_LIMIT=3000`, using the same size as the tested staging copy. Add its address to Turnstile.
4. Repeat Step 5's idea on production without test keys: sign in once normally and check that `rate_limits` shows your real IP. Run the smoke test with a clearly named test student.
5. Point the cleanup service at production and add an uptime monitor with alerts for `/api/health` (Railway does not monitor it after deployment). Frequent monitoring keeps Neon awake.
6. Give students the new address. They will need to sign in there.

**Rollback:** keep Vercel unchanged. Use **one address only** during an exam. Both use the same database if you kept it, so make only database changes that both versions can work with.

---

## 7. Go / no-go

Use Railway for a real exam **only if every box is ticked**:
- [ ] Next.js security update done, or its risk accepted in writing by the exam owner
- [ ] All code checks and the GitHub check pass
- [ ] Fake-IP check passes
- [ ] Smoke test and cleanup run pass
- [ ] Load testing permission confirmed
- [ ] Two 1000-student runs pass, including the data check
- [ ] Backup taken and restore practised
- [ ] Alerts reach a real person

If any is unticked, **do not claim the system is ready for 1000 students.**

## 8. Exam day

- **Day before:** back up, run the smoke test, freeze changes. Set Neon to the tested size with scale-to-zero off, and confirm 3 replicas.
- **30 minutes before:** `/api/health` is `ok`; admin and test student can sign in; Railway logs and Neon dashboard are open.
- **During:** no deployments or setting changes. A `MAINTENANCE` announcement blocks new starts while running tests continue.
- **After:** wait at least 10 minutes past the last deadline, confirm no attempt is still `IN_PROGRESS`, export results and back up.

## 9. Cost (estimate)

Railway Pro is $20 a month including $20 of usage; more usage is extra. Neon compute is $0.106 per CU-hour: 2 CU for 90 exam hours a month is about $19. Other Neon running time, storage, a staging copy, data transfer and tax are extra. Check current prices.
