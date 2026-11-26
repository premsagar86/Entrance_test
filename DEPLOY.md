# Deployment Guide

> **Follow [BUILD_PLAN.md](BUILD_PLAN.md).** It is the current plan (Railway + Neon) and replaces the hosting advice below. This file is kept for reference: Part A describes the Vercel app that is live today. Its "not fixed yet" notes about `clientIp()` and cleanup are out of date.

| Part | What it is | Use it when |
|---|---|---|
| **Part A** | **Vercel + Neon + Cloudflare R2 and Turnstile** | **Main guide. The app is live on Vercel.** |
| Part B | Self-hosted VPS (Docker Compose + Caddy) | Alternative: you want to run your own server |
| Part C | Railway + Neon + Cloudflare in front | Alternative: you decide to leave Vercel |

You only need **one** part. [CLOUDFLARE.md](CLOUDFLARE.md) belongs to the alternatives. Where it recommends another host or proxying the site through Cloudflare, that does not apply to Part A.

> **Capacity status:** 1000 simultaneous students has **not been proven**. This guide lowers the risk of failure; it cannot guarantee that nothing will go wrong. Read A10 (known risks) and A7 (load testing) before a large exam.

# Part A: Vercel + Neon + Cloudflare (main guide)

Contents: A1 where everything goes, A2 architecture, A3 environment variables, A4 setup steps, A5 releasing updates, A6 cleanup job, A7 load testing, A8 exam day, A9 incidents and troubleshooting, A10 known risks.

## A1. Where everything goes

| Part of the application | Deploy to / use | What you set up | Plan | Required? |
|---|---|---|---|---|
| Frontend (student and admin screens) | **Vercel** | One project linked to the GitHub repo | See below | Yes |
| Backend (`/api/*`) | **Vercel**, same project | Nothing extra: it deploys with the frontend | Same | Yes |
| Database | **Neon** Postgres | Database, pooled and direct URLs | Free for trials; paid compute for real exams | Yes |
| Uploaded documents | **Cloudflare R2** | Private bucket and API token | Check current pricing | Yes |
| Login bot protection | **Cloudflare Turnstile** | Widget for your domain | Check current pricing | Yes (login is rejected in production without it) |
| Code and checks | **GitHub** | Repo and the `ci.yml` checks | Any that fits | Yes |
| Cleanup of abandoned exams | **Vercel Cron** | Already in `vercel.json`; set `CRON_SECRET` | Frequency depends on plan | Yes |
| Reading scanned documents | Google **Gemini** | API key | Check current pricing | Optional |
| Email | Brevo | Nothing: sign-in sends no email | None | No |
| Redis (Upstash) | Not used | Nothing: the code has no Redis client | None | No |
| Railway, VPS | Not used in Part A | Nothing | None | No |
| Cloudflare proxy in front of the site | Not used in Part A | R2 and Turnstile work without it | None | No |

**Which Vercel plan?** Hobby is for **personal, non-commercial use only**. A paid or commercial exam service needs **Pro or Enterprise**. If unsure whether your use is commercial, ask Vercel. Check the plan in *Vercel -> Team Settings -> Billing*.

## A2. Architecture

The app is **one Next.js application** (screens and APIs in one codebase), run as serverless functions.

```
              Students and admins (browser)
                          |
                          |  HTTPS
                          v
   +---------------------- VERCEL ----------------------+
   |  Static files (JS, CSS, images)                    |
   |  Middleware (security headers, page guard)         |
   |  Functions: pages and /api/*                       |
   |  Cron: calls /api/cron/cleanup                     |
   +-------------+---------------------------+----------+
                 |                           |
                 v                           v
        NEON POSTGRES (pooler)        CLOUDFLARE R2
        students, tests, answers,     uploaded question
        results, sessions             documents

   CLOUDFLARE TURNSTILE: the browser shows the widget and the
   server verifies its token at sign-in.
```

**How traffic is handled**
1. Static files are served by Vercel.
2. Pages and API calls run in Vercel functions. Vercel adds capacity automatically, within plan limits. You do not configure a load balancer.
3. Logins, attempts and answers are stored in Neon, so any function instance can serve any student.
4. Each instance also keeps short-lived caches in memory: student sessions (30 s), questions (60 s) and maintenance status (5 s). Autosave limits are counted per instance.
5. Database connections go through Neon's pooler. **The database is the most likely bottleneck**, especially when everyone starts or submits together.

## A3. Environment variables

Set these in *Vercel -> Project -> Settings -> Environment Variables*. A change takes effect only after a **new deployment**.

| Variable | Where the value comes from | Needed in Production | Notes |
|---|---|---|---|
| `DATABASE_URL` | Neon **pooled** URL (host contains `-pooler`) | Yes | See A4 step 2 for the parameters. |
| `DIRECT_URL` | Neon **direct** URL | Yes | Used for migrations. |
| `SESSION_SECRET` | Generate | Yes | 32+ characters. The app checks that it exists. The current session code does not sign with it, so changing it does **not** log users out. |
| `DOB_PEPPER` | Generate | Yes | 32+ characters. **Never change it after importing students.** Stored date-of-birth hashes depend on it. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | Cloudflare R2 | Yes | All four, or uploads fail. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile site key | Yes | Built into the browser code: redeploy after changing it. |
| `TURNSTILE_SECRET` | Turnstile secret key | Yes | Server only. |
| `CRON_SECRET` | Generate | Yes | Protects `/api/cron/cleanup`. |
| `LOGIN_IP_LIMIT` | You choose | Recommended: `3000` | Student sign-in attempts per public IP per 15 minutes. The code default is 3000. A campus often shares one IP. |
| `GEMINI_API_KEY` | Google AI Studio | Optional | Fallback for scanned PDFs and images. `GEMINI_MODEL` can override the model. |

`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PHONE` are used only on your computer when creating an admin (step 6). They are not needed in Vercel.

Generate a secret (run once for each of the three):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rules:
- Keep a copy of the secrets, especially `DOB_PEPPER`, in a password manager.
- Never commit `.env` or paste secrets into chat, issues or screenshots.
- **Preview deployments must not use the production database or bucket.** Give the *Preview* environment separate values, or none.

## A4. Setup, step by step

> **The app is already live: audit, do not recreate.** Go through the steps and use each "Check" to confirm your current setup. Do **not** create a new production database, change `DOB_PEPPER`, or re-run the admin seed unless you intend to. Back up (A5) before changing anything. Do not change production during an exam.

### Step 1: Accounts and code
- **Do:** make sure you can sign in to GitHub, Vercel, Neon and Cloudflare. Turn on two-factor sign-in for each.
- On your computer, install Node 20 (the version CI uses), then run in the project folder:
  ```powershell
  npm ci --legacy-peer-deps
  npx prisma generate
  npm run typecheck
  npm test
  npm run build
  ```
- **Check:** every command finishes without errors.
- **If it fails:** fix it before deploying.

### Step 2: Neon database
- **Do (Neon dashboard):** create the project (Postgres 16 or 17), or open your existing one. Note its **region**. From *Connect*, copy:
  - **Pooled** URL (host contains `-pooler`) for `DATABASE_URL`
  - **Direct** URL (no `-pooler`) for `DIRECT_URL`
- Starting form of the pooled URL:
  ```
  postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DBNAME?sslmode=require&pgbouncer=true&connection_limit=1&connect_timeout=30
  ```
- **About `connection_limit`:** it is the number of database connections each app instance may use. `1` is the cautious serverless setting this project has used. With Vercel **Fluid compute** (*Settings -> Functions*), one instance can serve several requests at once, so they may wait in line for that single connection. Compare `1` with a higher value such as `5` during load testing and keep the one that performs better. Do not change a working production value without testing. These parameters are for Prisma 5, which this app uses; they were not re-confirmed against current documentation while writing this guide, and Neon's current Prisma guide describes Prisma 7.
- **For real exams:** use paid compute with **scale-to-zero off**. Choose the compute size from load test results.
- **Check:** after deploying, `/api/health` returns `{"status":"ok"}`.
- **If it fails:** check the URL, password and `sslmode=require`, and that the Neon project is active.

### Step 3: Cloudflare R2
- **Do (Cloudflare -> R2):** create a bucket and keep it **private**. Create an R2 API token with **Object Read & Write**, limited to that bucket. Record the account ID, access key, secret key and bucket name.
- **Check:** upload a document in the admin panel (step 10). The object appears in the bucket.
- **If it fails** with "File storage is unavailable": one of the four `R2_*` values is missing or wrong. Fix it and redeploy.

### Step 4: Cloudflare Turnstile
- **Do (Cloudflare -> Turnstile):** add a widget, mode *Managed*. Add every hostname students use, such as your `.vercel.app` address and custom domain.
- **Check:** the widget appears on both login pages and sign-in works.
- **If it fails:** see the Vercel function logs for lines starting `[turnstile]`. They show the reason code.

### Step 5: Vercel project and region
- **Do:** *Add New -> Project*, import the GitHub repo, framework *Next.js*, production branch `main`. `vercel.json` already sets the install and build commands and the cron.
- Add the variables from A3 **before** the first real use.
- **Set the function region close to Neon.** New projects default to Washington, D.C. (`iad1`). A distant region adds delay to **every database query**. In *Settings -> Functions -> Function Regions*, pick the region nearest your Neon region. Examples: Neon US East -> `iad1`; Neon Singapore -> `sin1`; Neon Frankfurt -> `fra1`. You can also add `"regions": ["sin1"]` (using your region) to `vercel.json`; a setting there is part of the next release.
- **Check:** confirm that Neon and Vercel show nearby regions. Redeploy after changing it.

### Step 6: Database tables and first admin
Run from your computer, in PowerShell. **Check the database host twice:** these commands change whichever database the variables point to. If you do not set them, Prisma may use the values in your local `.env`.

```powershell
$env:DATABASE_URL = "<Neon DIRECT url>"
$env:DIRECT_URL   = "<Neon DIRECT url>"

npx prisma migrate status     # shows the target database and any pending migrations
npx prisma migrate deploy     # applies pending migrations
```

**New database only** (or when you intend to add an admin or change an admin's phone):

```powershell
$env:SEED_ADMIN_EMAIL = "<admin email>"
$env:SEED_ADMIN_PHONE = "<8-15 digits>"
npx tsx prisma/seed.ts
```

Then clear the values from the terminal:

```powershell
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PHONE -ErrorAction SilentlyContinue
```

- The admin signs in with **email + phone number**. No code is emailed. The phone number acts as the password, so use a long, hard-to-guess number that is not publicly known.
- **Check:** `npx prisma migrate status` (with the variables set) reports that the schema is up to date.
- **If it fails:** use the **direct** URL for migrations, not the pooled one. Do not use `prisma migrate reset` or `prisma db push` on production: they can destroy or alter data.

### Step 7: Deploy
- **Do:** follow the release routine in A5. With Vercel's GitHub integration, a push to `main` deploys to production. For the first deployment, or after changing variables, use *Deployments -> Redeploy*.
- Vercel does not wait for the GitHub checks by default. In *GitHub -> Settings -> Branches*, protect `main`, require pull requests and require the `verify` check.
- **Check:** the build log is successful.
- **If it fails:** read the first error in the build log. Install and build commands come from `vercel.json`.

### Step 8: Health check and monitoring
```powershell
curl.exe -s https://<your-domain>/api/health
```
- **Expected:** `{"status":"ok"}`. A `503` with `degraded` means the database did not answer within 3 seconds.
- This checks **only the database**, not R2, Turnstile or cron.
- Point an uptime monitor at this URL and send alerts to someone who will see them. Frequent checks keep the database active, which affects Neon usage.

### Step 9: Cron
- Set `CRON_SECRET`, redeploy, then see A6.

### Step 10: Smoke test (after setup and after every release)
Use a clearly named test exam and test student. Do not use a real student's account.

| # | Action | Expected |
|---|---|---|
| 1 | Sign in at `/admin/login` with email + phone | Admin panel opens |
| 2 | Add one test student | Student is listed |
| 3 | Upload a small DOCX, PDF and XLSX (under 4 MB each) | Questions are read; files appear in R2 |
| 4 | Check questions, set the answer key, set duration and window, assign, publish | Test is published |
| 5 | In a private window, sign in as the student and start | Questions and timer appear |
| 6 | Answer, wait at least 15 seconds, refresh | Answers are still there |
| 7 | Submit | Submission succeeds; result follows the release setting |
| 8 | In admin, check results and export | The attempt and score are correct |
| 9 | Check *Vercel -> Logs* | No unexpected errors |

## A5. Releasing updates safely

Never release during an exam, or shortly before one.

1. **Back up** the database if the release touches data or the schema. This needs the PostgreSQL client tools, at the same or a newer major version than the database:
   ```powershell
   pg_dump "<Neon DIRECT url>" -Fc -f "D:\backups\aptitude-$(Get-Date -Format yyyyMMdd-HHmm).dump"
   ```
   The folder must exist. Keep it outside the repo and private: it contains student data. Also check how far back your Neon plan can restore. Practise restoring into a **new, empty** database (`pg_restore --no-owner -d "<new database url>" <file>`).
2. **Work on a branch**, run the commands from step 1 of A4, and open a pull request.
3. **Wait for CI** (`verify`) to pass.
4. **Test the preview deployment** only if Preview uses non-production data. Turnstile must allow the preview hostname, or use test keys in Preview.
5. **Database migrations** (a new folder in `prisma/migrations`) are **manual**: the Vercel build does not run them. Apply them to staging first. Apply to production (A4 step 6) **before** merging code that needs them. Keep them backward-compatible (add first, remove in a later release), because the old code is still running.
6. **Merge to `main`.** Vercel deploys it.
7. **Verify:** health check, smoke test and logs.

**Rollback:** in *Vercel -> Deployments*, use *Instant Rollback* (or *Promote to Production*) on the previous good deployment. Which older deployments you can choose may depend on your plan. A rollback changes **code only**: it does not undo migrations or data changes. Then revert the bad commit in Git so the next push does not bring it back.

## A6. Cleanup job (abandoned exams)

`/api/cron/cleanup` scores and closes attempts that are still open **more than 10 minutes past their deadline**, and removes old sessions and rate-limit records. `vercel.json` runs it once a day at 03:30 **UTC**.

| Plan | Cron frequency | What to do |
|---|---|---|
| Hobby | At most once a day; timing is only accurate to about an hour | Keep daily. Run it by hand after an exam. |
| Pro / Enterprise | Up to once a minute | For exam periods, change the schedule in `vercel.json` to `*/5 * * * *` and release it before exam day |

A more frequent expression **fails deployment** on Hobby.

Run it by hand (wait at least 10 minutes after the last deadline):

```powershell
curl.exe -s -H "Authorization: Bearer <CRON_SECRET>" https://<your-domain>/api/cron/cleanup
```

- **Expected:** `{"ok":true, "expiredAttempts": ...}`.
- `401`: the secret is missing or different. `500`: read the logs for `cron cleanup failed`. With many abandoned attempts it may reach its 60 second limit; run it again and check that the number of open attempts falls. See also risk 2 in A10.

## A7. Load testing for 1000 students

### Get permission first
Vercel's [load testing policy](https://vercel.com/kb/guide/what-s-vercel-s-policy-regarding-load-testing-deployments) (read 2026-11-26) says load testing is **only permitted on Enterprise plans**, with prior notice and approval. It says unannounced tests are likely to breach fair use and to be blocked.

- **Do not run k6 against a Vercel deployment without Vercel's written approval.** This includes staging projects.
- Contact Vercel Support or sales. Be ready to give: start and end time, peak requests per second, target hostnames, source location and IP addresses, whether load is distributed, and whether Fluid compute is on. They may also require Log Drains. Tests can add usage charges.
- **Without approval:** you could run the test against a separate self-hosted copy (Part B) with its own database, on infrastructure whose rules allow load testing. This can expose problems in the app and database code, but it does **not** show how Vercel will perform. In that case, 1000 students **on Vercel remains unproven**: tell the exam owner, and consider smaller batches or a host you can test.

### Set up staging
1. A **separate** project and a **separate, new, empty** Neon database. Do not copy production: it contains student data. Use the same region, Neon compute and settings as you plan for production.
2. Turnstile **test keys**, on staging only: `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA`, `TURNSTILE_SECRET=1x0000000000000000000000000000000AA`.
3. Separate secrets. Set `LOGIN_IP_LIMIT=10000` if you will repeat tests from one IP.
4. Apply migrations, create a staging admin, and publish a test with realistic questions. Make its window and duration long enough for the whole run.

### Run
Install [k6](https://k6.io). The seed script reads `.env`, but variables already set in your terminal take priority. **Set them explicitly** so it cannot fall back to another database. It prints the database host: confirm it is staging.

```powershell
$env:DATABASE_URL = "<STAGING direct url>"
$env:DIRECT_URL   = "<STAGING direct url>"
$env:DOB_PEPPER   = "<STAGING pepper>"
$env:ALLOW_LOADTEST_SEED = "yes"
npm run loadtest:seed -- <testId> 1000

k6 run -e BASE_URL=https://<staging-domain> -e TEST_ID=<testId> -e VUS=1000 scripts/loadtest/k6-exam.js

Remove-Item Env:DATABASE_URL, Env:DIRECT_URL, Env:DOB_PEPPER, Env:ALLOW_LOADTEST_SEED
```

The script logs students in over 60 s, autosaves every 10 s, then has **everyone submit at the same moment**. If one computer cannot generate the load reliably, use several and make sure each uses different student accounts (the script as written numbers students from 1 on each machine, so it needs a change first).

### Pass criteria

| Measure | Target |
|---|---|
| Failed requests | Under 1% (the run stops early if exceeded); investigate every 5xx |
| Login, 95th percentile | Under 2 s |
| Start, 95th percentile | Under 2.5 s |
| Autosave, 95th percentile | Under 500 ms |
| Submit, 95th percentile | Under 3 s |
| Students finishing | Over 99% in the script; for a real exam, investigate **every** failure |

Then check the saved data in the Neon SQL editor:

```sql
SELECT status, count(*) FROM attempts WHERE test_id = '<testId>' GROUP BY status;
SELECT count(*) FROM answers a JOIN attempts t ON t.id = a.attempt_id WHERE t.test_id = '<testId>';
```

Expect 1000 `SUBMITTED` attempts after a clean run on a fresh test, and a plausible answer count. Spot-check several students' answers and scores. A fast response is not enough if data is wrong.

While it runs, watch Neon (CPU, memory, connections) and Vercel (errors, duration, timeouts, throttling).

**If it fails,** change **one thing at a time** and repeat:

| What you see | Check first |
|---|---|
| Every request is slow | Vercel and Neon regions |
| Prisma pool timeout (`P2024`) | `connection_limit` and slow queries |
| Database CPU at its limit | Neon compute size |
| Slow or failing submits | Scoring transaction duration and lock waits in the logs |
| `429` at login | `LOGIN_IP_LIMIT` and the per-email limit (5 per 15 minutes) |
| Blocked or challenged requests | Vercel firewall and your approval; do not try to evade it |

**Afterwards:** delete the whole staging database. `npm run loadtest:seed -- --clean` is likely to fail once the students have attempts, because the database blocks deleting a student with an attempt.

## A8. Exam day

**One week before**
- [ ] Vercel plan suits your use; plan limits and usage allowances checked
- [ ] Load test passed, or the owner has accepted in writing that capacity is unproven
- [ ] Risks in A10 fixed or accepted
- [ ] Neon paid compute sized, scale-to-zero off
- [ ] Backup restore practised
- [ ] Student list, test, answer key, duration and window checked
- [ ] Release freeze agreed

**The day before**
- [ ] Take a backup
- [ ] Smoke test passes
- [ ] Uptime alerts reach a real person
- [ ] Do not edit the published test's questions once the exam starts

**30 minutes before**
- [ ] `/api/health` returns `ok`
- [ ] Admin and a test student can sign in
- [ ] Vercel logs and the Neon dashboard are open
- [ ] [Vercel status](https://www.vercel-status.com), [Neon status](https://neonstatus.com) and [Cloudflare status](https://www.cloudflarestatus.com) checked

**During**
- Start students in batches, for example a few minutes apart. If batches need different start or end times, set up separate tests and verify each one. Staggering reduces the login and submit peaks.
- Watch errors, response time and database load. Do not deploy, migrate or change settings unless fixing an incident.
- Have a way to tell students what to do, and keep a written record of times and problems.

**After**
- [ ] At least 10 minutes after the last deadline, run cleanup (A6)
- [ ] Check that no attempts for the test remain `IN_PROGRESS`
- [ ] Export results and back up
- [ ] Review logs, then reduce Neon compute if you increased it

## A9. Incidents and troubleshooting

**First:** note the time, find out how many students are affected, and check health, Vercel logs and the three status pages.

| Situation | Action |
|---|---|
| Problem began right after a release | Roll back (A5), after confirming the old code works with the current database |
| Database slow or unavailable | Check Neon. Increase compute if it is the limit (this may restart connections). Pause further batches |
| New students must not start | Post a `MAINTENANCE` announcement for students. It blocks **new** starts within a few seconds; running attempts can still save and submit |
| One student's connection drops | Ask them to reconnect and reopen the test. Do not assume unsaved answers reached the server: check |
| Data looks wrong | Stop changes and take a backup first. Do not restore over the live database during an exam |

| Symptom | Likely cause and fix |
|---|---|
| Health shows `degraded` | Database URL, Neon availability or load |
| Can't reach database / too many connections | Use the **pooled** URL with `pgbouncer=true`; check `connection_limit` |
| App or login errors mentioning Zod or environment variables | `SESSION_SECRET` or `DOB_PEPPER` missing or shorter than 32 characters |
| "Verification failed" at login | Turnstile keys or hostname; see `[turnstile]` logs |
| Turnstile widget missing | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` missing; add it and redeploy |
| "Too many attempts" | Student: 5 per email per 15 min, plus `LOGIN_IP_LIMIT`. Admin: 10 per IP per 15 min and 5 per email per 10 min |
| All students fail sign-in after a settings change | Wrong database, or `DOB_PEPPER` changed (affects date-of-birth sign-in) |
| "File storage is unavailable" | `R2_*` values |
| "File is larger than 4 MB" | The app's limit; compress or split the file. Vercel's default request limit is 4.5 MB |
| Upload times out | The upload function is set to 60 s; use a smaller, text-based file |
| Cron returns 401 | `CRON_SECRET` missing or changed without redeploying |
| Deploy fails on the cron schedule | Hobby allows only daily cron |
| Error about a missing table or column | A migration was not applied |

## A10. Known risks before a large exam

These were found by reading the code. **They are not fixed yet.**

| # | Risk | Effect | What to do |
|---|---|---|---|
| 1 | `clientIp()` in `src/lib/http.ts` trusts the `cf-connecting-ip` header first. In Part A, no Cloudflare proxy sets it | Someone can likely send a fake value and bypass the per-IP limits on student and admin login. Not tested on the live site. Admin sign-in is the main concern because the phone number is the password | **Fix in code before relying on IP limits.** Per-email limits and Turnstile still apply |
| 2 | `src/lib/cleanup.ts` closes attempts one at a time and stops at the first error | One bad attempt can block the rest and the other cleanup | Fix in code; after each exam check for open attempts |
| 3 | `vercel.json` sets no region | Functions may run far from the database | Set it (A4 step 5) |
| 4 | `connection_limit=1` | May limit how many requests an instance handles together | Compare values in testing |
| 5 | Vercel Hobby | Non-commercial only; daily cron | Use Pro for commercial use |
| 6 | Load testing policy | You may be unable to prove capacity on your plan | See A7 |

**Platform limits** (Vercel documentation read 2026-11-26; check again, since they change): request body 4.5 MB by default; [function duration and file descriptor limits](https://vercel.com/docs/functions/limitations) apply, including 1,024 file descriptors shared by concurrent executions in an instance; [cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing); [function regions](https://vercel.com/docs/functions/configuring-functions/region); [Hobby plan rules](https://vercel.com/docs/plans/hobby). Neon: [connection pooling](https://neon.com/docs/connect/connection-pooling).

---

# Part B: Self-hosted VPS (Docker Compose + Caddy)

Sections below are prefixed with `V`. Sign-in sends no email. Only `ci.yml` (checks) exists in `.github/workflows`; for a VPS you update with the manual flow in V7.

Complete guide to deploying the Aptitude Test Platform to production with Docker Compose (recommended), plus notes for non-Docker and managed hosting.

## V1. Architecture

```
Internet --443--> Caddy (auto HTTPS) --> app (Next.js standalone, :3000) --> db (PostgreSQL 16)
                                              |
                                              +--> uploads volume (/app/storage)
```

- **caddy**: terminates TLS (Let's Encrypt certificates are automatic) and reverse-proxies to the app.
- **app**: the Next.js server. Only reachable through Caddy.
- **db**: PostgreSQL. No published port; only reachable inside the Docker network.
- **migrate** (profile `tools`): one-shot container for migrations, admin seed and cleanup.
- Volumes: `pgdata` (database), `uploads` (question documents), `caddy_data` (certificates).

## V2. Prerequisites

- A Linux VPS: **2 vCPU / 2 GB RAM minimum** (4 GB if many students test at once), 20 GB disk. Ubuntu 22.04/24.04 assumed.
- A **domain name** with an `A` record pointing to the server's public IP (e.g. `tests.example.com`).
- Ports **80 and 443** open (Let's Encrypt needs both).
- Docker Engine and the Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # log out and back in
  docker compose version
  ```

## V3. Third-party services

| Service | Needed? | What to do |
|---|---|---|
| **Brevo** | No | Admin sign-in uses email + phone number, so no email is sent. Optional for future use. |
| **Cloudflare Turnstile** | Strongly recommended | Dashboard -> Turnstile -> add your domain. Copy the site key and secret key. |
| **Google Gemini** | Optional | Only a fallback for parsing scanned PDFs/images. Create a key in Google AI Studio. |

## V4. Get the code and configure

```bash
git clone <your-repo-url> aptitude && cd aptitude
cp .env.example .env
```

Generate secrets (run once per value):

```bash
openssl rand -hex 32
```

Edit `.env`:

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | Database password. Compose builds `DATABASE_URL`/`DIRECT_URL` from it, overriding those two values in `.env`. |
| `SESSION_SECRET` | Yes | 32+ random chars. Required by the app; changing it does not log users out. |
| `DOB_PEPPER` | Yes | 32+ random chars used to hash student DOBs. **Never change it after importing students**, or no student can log in. |
| `DOMAIN` | Yes | Your domain, e.g. `tests.example.com`. Caddy uses it to obtain the certificate. |
| `SEED_ADMIN_EMAIL` | Yes | First admin's email. |
| `SEED_ADMIN_PHONE` | Yes | First admin's phone, 8-15 digits (e.g. `919876543210`). It is the admin's sign-in password (with the email). Use a long, unusual number, not a real phone. |
| `BREVO_API_KEY` | No | Not used by sign-in. |
| `MAIL_FROM` | No | Not used by sign-in. |
| `TURNSTILE_SECRET` | Recommended | Server-side Turnstile key. |
| `TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Recommended | Site key (set both to the same value). The public one is baked in **at build time**, so rebuild after changing it. |
| `GEMINI_API_KEY` | Optional | Scanned-document fallback. |
| `STORAGE_DIR` | No | Set by compose to `/app/storage` (the `uploads` volume). |
| `R2_*` | No | Optional on a VPS: if all four are set, uploads go to R2 instead of the volume. |

Lock the file down: `chmod 600 .env`. **Never commit `.env`.**

## V5. First deploy

```bash
# 1. Build images
docker compose build

# 2. Start the database and apply migrations
docker compose up -d db
docker compose --profile tools run --rm migrate

# 3. Create the first admin (uses SEED_ADMIN_EMAIL / SEED_ADMIN_PHONE)
docker compose --profile tools run --rm migrate npx tsx prisma/seed.ts

# 4. Start everything
docker compose up -d

# 5. Check
docker compose ps
curl -s https://tests.example.com/api/health     # {"status":"ok"}  (use your DOMAIN)
docker compose logs -f app caddy
```

The first request can take a few seconds while Caddy obtains the certificate. If it fails, see Troubleshooting.

## V6. Smoke test

1. Open `https://<DOMAIN>/admin/login` and sign in with the admin email + phone number (no code is emailed).
2. **Students**: import a CSV roster or add one student.
3. **Documents**: upload a question file, review the parsed questions and set the answer key.
4. **Tests**: create a test, set duration and window, assign students, publish.
5. In a private window, log in as a student, take the test, submit and check the result page.
6. Back in admin: check ranked results, and the integrity data (tab switches) at `/api/admin/tests/<id>/analytics`.
7. Confirm an uploaded file survives `docker compose restart app`.

## V7. Updating

```bash
git pull
scripts/backup.sh                                   # always back up first
docker compose build
docker compose --profile tools run --rm migrate     # apply new migrations
docker compose up -d                                # recreates changed containers
curl -s https://<DOMAIN>/api/health
```

**Rollback:** check out the previous tag, rebuild and `docker compose up -d`. Migrations are forward-only: if the release added a migration, restore the pre-update database backup (section 8) before rolling back the code.

## V7a. CI/CD on a VPS

The only workflow in this repo is `ci.yml` (checks), which works for any setup. On a VPS, update with the manual flow in V7, or write your own deploy job (SSH, `docker compose build`, migrate, `up -d`, health check). `docker-compose.yml` also accepts prebuilt images via `IMAGE` and `TAG` if you push them to a registry. `scripts/server-setup.sh` prepares a fresh Ubuntu VPS (Docker, firewall, fail2ban, `deploy` user, swap).

## V8. Backups and restore

Backup (database dump + uploads):

```bash
scripts/backup.sh /var/backups/aptitude 14     # keep 14 days
```

Schedule it, plus the daily cleanup, with cron (`crontab -e`, adjust paths):

```cron
15 2 * * *  cd /opt/aptitude && scripts/backup.sh /var/backups/aptitude 14 >> /var/log/aptitude-backup.log 2>&1
30 3 * * *  cd /opt/aptitude && docker compose --profile tools run --rm migrate npx tsx scripts/cleanup-attempts.ts >> /var/log/aptitude-cleanup.log 2>&1
```

Copy backups **off the server** (rsync, or rclone to S3/R2/Drive). A backup on the same disk is not a backup.

Restore:

```bash
docker compose stop app
docker compose exec -T db psql -U aptitude -d postgres -c "DROP DATABASE aptitude;" -c "CREATE DATABASE aptitude;"
gunzip -c /var/backups/aptitude/db-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U aptitude -d aptitude

# uploads (start app first so the container exists, then unpack into the volume)
docker compose up -d app
docker compose exec -T app tar -C /app -xzf - < /var/backups/aptitude/uploads-YYYYMMDD-HHMMSS.tar.gz
```

**Do a restore drill** on a spare machine before you need it for real.

## V9. Security hardening

- Firewall: allow only 22, 80, 443.
  ```bash
  sudo ufw default deny incoming && sudo ufw allow 22,80,443/tcp && sudo ufw enable
  ```
- SSH: key-only login, no password or root login.
- The admin phone number is the password: pick a long, unique value, keep Turnstile on, and do not reuse a real phone number.
- Keep `.env` out of git, mode `600`. Rotate `SESSION_SECRET` and API keys if leaked (never `DOB_PEPPER`). Rotating `SESSION_SECRET` does not end existing sessions.
- Enable unattended security updates: `sudo apt install unattended-upgrades`.
- The app already sets HSTS, a nonce-based CSP and frame/referrer/permissions headers, and rate-limits login.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and `npm audit`; accept Dependabot updates.
- Before a large live exam, load-test login + autosave (e.g. k6) at your expected concurrency, and scan a staging copy (e.g. OWASP ZAP). These are not automated in this repo.

## V10. Operations

- **Logs:** `docker compose logs -f app` (add `--since 1h`). Caddy: `docker compose logs caddy`.
- **Health:** `/api/health` returns 200 `ok`, or 503 `degraded` if the DB is unreachable. Point an uptime monitor (UptimeRobot, Better Stack) at it.
- **Maintenance mode:** post a `MAINTENANCE` announcement in the admin panel; it blocks starting new tests while running ones continue.
- **Exam day:** take a backup, check disk space (`df -h`), confirm health, keep `docker compose logs -f app` open.
- **Disk:** check with `docker system df`; run `docker image prune -f` after updates.

## V11. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Caddy can't get a certificate | DNS `A` record not pointing at the server, or ports 80/443 blocked. See `docker compose logs caddy`. |
| `set POSTGRES_PASSWORD` error | `POSTGRES_PASSWORD` missing in `.env`. |
| App restarts; logs show Zod/env errors | `SESSION_SECRET` / `DOB_PEPPER` missing or shorter than 32 chars. |
| Students can't log in after a change | `DOB_PEPPER` was changed. Restore the original value. |
| Turnstile widget missing | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was set after build; run `docker compose build --no-cache app`. |
| Uploads vanish after redeploy | Volume not mounted; `docker compose config` should show `uploads:/app/storage`. |
| `P1001` can't reach database | db not healthy yet; check `docker compose ps` and retry the migrate step. |
| Uploaded document fails to parse | Scanned file with no `GEMINI_API_KEY`; use a text-based DOCX/PDF/XLSX or set the key. |

## V12. Alternatives

### Without Docker (VM)
1. Install Node 20, PostgreSQL 16 and Caddy (or nginx + certbot).
2. Create the database and user; set `DATABASE_URL` / `DIRECT_URL` in `.env`.
3. Build and migrate:
   ```bash
   npm ci --legacy-peer-deps
   npx prisma generate && npx prisma migrate deploy
   npm run db:seed
   NEXT_PUBLIC_TURNSTILE_SITE_KEY=<site key> npm run build
   ```
4. Run `npm start` (port 3000) under systemd with `EnvironmentFile=/opt/aptitude/.env`, `Restart=always` and an unprivileged `User`. Set `STORAGE_DIR` to a persistent, backed-up directory.
5. Reverse-proxy 443 to 127.0.0.1:3000 (Caddy: `reverse_proxy 127.0.0.1:3000`).
6. Cron `npm run cleanup` daily.

### Managed platforms
- Use a managed PostgreSQL (Neon, Supabase, RDS): `DATABASE_URL` (pooled) and `DIRECT_URL` (direct, for migrations).
- Hosts with a **persistent disk** (Railway, Render, Fly.io) work; mount a volume at `STORAGE_DIR`. Serverless hosts need R2 for uploads (supported, see Part A).
- Run `npx prisma migrate deploy` as the release command, and seed the admin once.


---

# Part C: Railway + Neon + Cloudflare in front (1000 students)

Cloudflare handles DNS, TLS, WAF, rate limits, Turnstile and static caching. Railway runs the whole Next.js app (pages and API on one domain). Neon is the database. See [CLOUDFLARE.md](CLOUDFLARE.md) "Choosing a hosting path" (Path A).

```
Students -> Cloudflare (proxied CNAME) -> Railway (3 replicas, one app) -> Neon (pooled) + R2
```

## C1. Neon
Paid plan, **scale-to-zero off**, same region as Railway. `DATABASE_URL` = pooled (`-pooler`) host with `?sslmode=require&pgbouncer=true&connection_limit=10&pool_timeout=20`; `DIRECT_URL` = direct host. From your computer: `npx prisma migrate deploy`, then `npx tsx prisma/seed.ts` (first admin).

Connection budget: 3 replicas x 10 = 30 connections through the pooler.

## C2. Railway (Pro plan, needed for replicas)
1. New project -> Deploy from the GitHub repo. `railway.json` sets the Dockerfile build, 3 replicas and the `/api/health` healthcheck. The last Dockerfile stage (`run`) is what gets built.
2. Service variables:

| Variable | Notes |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | C1. |
| `SESSION_SECRET`, `DOB_PEPPER` | 32+ random chars (`openssl rand -hex 32`). Never change `DOB_PEPPER` after importing students. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | Required: a local disk is not shared between replicas. |
| `TURNSTILE_SECRET`, `TURNSTILE_SITE_KEY` | From Cloudflare Turnstile. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Same site key. Build-time: redeploy after changing it. |
| `CRON_SECRET` | Random 32+ chars. |
| `LOGIN_IP_LIMIT` | `3000`. |
| `GEMINI_API_KEY` | Optional. |

3. Settings -> Networking -> add your custom domain (Railway shows the CNAME target).

## C3. Cloudflare
Add the domain; create a **proxied CNAME** (orange cloud) to the Railway target; SSL/TLS **Full (strict)**; then CLOUDFLARE.md sections 4 (Turnstile) and 9 (WAF, rate limits, cache rules). Skip the Tunnel (section 3). Do **not** create a Workers app and keep "Protect with Cloudflare Access" off.

## C4. Cleanup cron (replaces Vercel Cron)
Add a second Railway service (or any scheduler) that runs every 5 minutes during exam windows:
```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/cleanup
```

## C5. Before the exam
Run the staging load test (CLOUDFLARE.md section E), then the exam-day checklist (section F). No deploys during an exam.
