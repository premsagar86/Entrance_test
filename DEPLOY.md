# Deployment Guide

Two supported ways to run this app:

- **Part A (recommended, free): Vercel Hobby + Neon Postgres + Cloudflare R2.** No server to manage. Vercel Hobby is for **non-commercial use only**.
- **Part B: self-hosted VPS with Docker Compose + Caddy** (paid VPS, full control).

# Part A: Vercel + Neon + R2 (free)

## A1. Architecture

```
Browser --> Vercel (Next.js serverless + daily cron) --> Neon Postgres (pooled connection)
                       |--> Cloudflare R2 (uploaded documents)
GitHub push -> Vercel auto-deploy (GitHub Actions only run CI checks)
```

## A2. Create the free accounts

1. **Neon** (neon.tech): new project (Postgres 16/17). From *Connect* copy two strings:
   - **Pooled** (host contains `-pooler`) -> `DATABASE_URL`. Append `&pgbouncer=true&connect_timeout=15` (keep `?sslmode=require`).
   - **Direct** (no `-pooler`) -> `DIRECT_URL` (used only for migrations).
2. **Cloudflare R2**: create a private bucket. Create an **R2 API token** (Object Read & Write, scoped to the bucket). Note the account id, access key id, secret and bucket name.
3. **Cloudflare Turnstile**: add a widget for your Vercel domain; copy the site key and secret.
4. **Brevo (optional, not needed for login)**: admin sign-in now uses email + phone number, so no email is sent. If you want email later, create a free account (about 300 emails/day). Add and verify a sender (Senders, Domains & Dedicated IPs -> Senders; a verified domain with SPF/DKIM gives the best deliverability). Then *SMTP & API -> API Keys -> Generate a new API key* (the **API** key, not an SMTP key). Set `BREVO_API_KEY=<key>` and `MAIL_FROM="Aptitude Test <your-verified-sender>"`. `MAIL_FROM` must be a verified Brevo sender or mail is rejected.
5. **Gemini** (optional): API key from Google AI Studio.
6. **Vercel**: *Add New -> Project*, import the GitHub repo (framework Next.js; `vercel.json` sets the install and build commands). `vercel.json` disables Vercel's own Git auto-deploys; the GitHub workflow in A5 deploys instead, after migrations.

## A3. Environment variables (Vercel -> Project -> Settings -> Environment Variables, Production)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** URL (see A2). |
| `DIRECT_URL` | Neon **direct** URL. |
| `SESSION_SECRET`, `DOB_PEPPER` | 32+ random chars each (`openssl rand -hex 32`). **Never change `DOB_PEPPER`** after importing students. |
| `BREVO_API_KEY`, `MAIL_FROM` | Optional (not used by sign-in). |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | From A2.2. Uploads fail on Vercel without them. |
| `TURNSTILE_SECRET`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | From A2.3. |
| `GEMINI_API_KEY` | Optional. |
| `CRON_SECRET` | Random 32+ chars. Vercel Cron sends it to `/api/cron/cleanup`. |

`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PHONE` are only needed when you run the seed (A4).

## A4. First release (once, from your computer)

```bash
npm ci --legacy-peer-deps
export DATABASE_URL="<Neon DIRECT url>" DIRECT_URL="<Neon DIRECT url>"
export SEED_ADMIN_EMAIL="you@example.com" SEED_ADMIN_PHONE="919876543210"
npx prisma migrate deploy
npx tsx prisma/seed.ts          # creates the first admin
```

Then deploy: push to `main` (Vercel deploys automatically, see A5). Check `https://<your-app>.vercel.app/api/health` returns `{"status":"ok"}`, then run the smoke test (V6 below).

## A5. Deploys (automatic) and CI

**Deploys:** Vercel's GitHub integration deploys the app. Every push to `main` goes to production, and every pull request gets its own preview URL. No GitHub Actions are needed for deploying, and no tokens or secrets in GitHub.

One-time setup:
1. Vercel -> *Add New -> Project* -> import the GitHub repo (A2.6). Production branch: `main`.
2. Add the environment variables from A3, then *Deployments -> Redeploy* once.
3. Check `https://<your-app>.vercel.app/api/health` returns `{"status":"ok"}`.

**Checks (optional but recommended):** `.github/workflows/ci.yml` runs lint, typecheck, tests, the build and the migrations against a clean Postgres on every push and pull request. In GitHub *Settings -> Branches*, protect `main` and require the `verify` check, so broken code is caught in the pull request. Vercel itself still deploys on push.

**Database migrations are manual.** When a change adds a migration (a new folder in `prisma/migrations`), run it once from your computer before or right after merging:
```bash
npx prisma migrate deploy
```
It uses `DIRECT_URL` from your `.env`. Keep migrations backward-compatible (add columns/tables first, remove later), because the old and new code run side by side during a deploy.

**Rollback:** Vercel -> Deployments -> pick the previous good deployment -> *Promote to Production* (instant). It does not undo migrations.

**Backups:** Neon keeps a short point-in-time restore window on the free plan. For extra safety, take a manual dump before risky changes: `pg_dump "<direct url>" | gzip > backup.sql.gz`. Keep it private; it contains student data.

**Daily cleanup** (stale attempts, expired sessions) runs from Vercel Cron (`vercel.json`, 03:30 UTC) calling `/api/cron/cleanup`; it needs `CRON_SECRET` in Vercel.

## A6. Free-tier limits to know

- **Vercel Hobby**: non-commercial only; uploads are limited to **4 MB** per file (request body cap, enforced in the app); function time limits apply to document parsing, so very large scanned PDFs may time out (prefer text-based files).
- **Neon free**: compute scales to zero when idle, so the first request after a quiet period is slower. Before an exam, open `/api/health` a few minutes early. Storage and compute are limited.
- **Brevo**: optional and unused by sign-in.
- **Large exams**: see A6a below.

## A6a. Planning for 300-500 students at once

What the app already does to stay light:
- Autosave sends only changed answers, every 10 s, as one database statement per request.
- Student sessions are cached in memory for 30 s per server instance, so most requests skip the session lookup. A logout or a new login elsewhere can take up to 30 s to reach every instance. Admin sessions are never cached.
- The question list and each test's start payload are cached in memory for 60 s per instance, so a question edit on a live test shows up within a minute.
- Autosave and integrity events use a light in-memory limiter instead of a database write, and the hot paths load only the few attempt columns they need.
- Scoring and timing run on the server.

Settings to apply on Vercel:
- `DATABASE_URL` (Neon **pooled** URL) ends with `?sslmode=require&pgbouncer=true&connection_limit=1&connect_timeout=30`. `DIRECT_URL` stays the non-pooled URL.
- `LOGIN_IP_LIMIT` (optional, default 600): student sign-in attempts per public IP per 15 minutes. Many students on one campus network share one IP, so the old limit of 30 would have locked most of them out. Set it to a little above the number of students sharing one network (for 500 students, 600) and lower it for smaller groups. The per-email limit (5 attempts) still protects each account.

Before the real exam:
1. **Load test it.** Create a separate staging Vercel project + Neon database that uses Cloudflare's always-pass Turnstile test keys (see the header of `scripts/loadtest/k6-exam.js`). Create a published test with a few questions, then:
   ```bash
   npm run loadtest:seed -- <testId> 500        # makes 500 throwaway students (batch LOADTEST)
   k6 run -e BASE_URL=https://your-staging.vercel.app -e TEST_ID=<testId> -e VUS=500 scripts/loadtest/k6-exam.js
   npm run loadtest:seed -- --clean             # removes them afterwards
   ```
   Pass if: error rate under 1 %, p95 under 1.5 s, no 429 or 500. Watch the Neon dashboard (CPU, connections) while it runs.
2. **Wake the database** by opening `/api/health` about 5 minutes before the start. Neon's free plan sleeps when idle.
3. **Stagger the start** with a start window (`startAt`/`endAt`) so 500 people do not sign in in the same second.
4. **Do not deploy** during the exam. Take a manual `pg_dump` first.
5. **If the load test fails:** upgrade Neon (more compute, no cold starts) first. Vercel Hobby is for non-commercial use only; if this is a paid or institutional exam, use Vercel Pro.

## A7. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Upload fails: "File storage is not configured" | `R2_*` variables missing in Vercel. |
| Upload says file larger than 4 MB | Vercel body cap; compress or split the file. |
| `Can't reach database` / too many connections | `DATABASE_URL` must be the **pooled** URL with `pgbouncer=true`. |
| Turnstile widget missing | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` missing in Vercel; redeploy after adding. |
| Cron route returns 401 | `CRON_SECRET` not set in Vercel. |

---

# Part B: Self-hosted VPS (Docker Compose + Caddy)

Sections below are prefixed with `V`. Mail uses the Brevo API. The Only `ci.yml` (checks) exists in `.github/workflows`; for a VPS you update with the manual flow in V7.

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
| `SESSION_SECRET` | Yes | 32+ random chars. Changing it logs everyone out. |
| `DOB_PEPPER` | Yes | 32+ random chars used to hash student DOBs. **Never change it after importing students**, or no student can log in. |
| `DOMAIN` | Yes | Your domain, e.g. `tests.example.com`. Caddy uses it to obtain the certificate. |
| `SEED_ADMIN_EMAIL` | Yes | First admin's email. |
| `SEED_ADMIN_PHONE` | Yes | First admin's phone, 8-15 digits (e.g. `919876543210`). It is the admin's sign-in password (with the email). Use a long, unusual number, not a real phone. |
| `BREVO_API_KEY` | Yes (prod) | Brevo API key. |
| `MAIL_FROM` | Yes (prod) | Sender verified in Brevo. |
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

1. Open `https://<DOMAIN>/admin/login`, enter the admin email + phone, then the emailed code.
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
- Keep `.env` out of git, mode `600`. Rotate `SESSION_SECRET` and API keys if leaked (never `DOB_PEPPER`).
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
