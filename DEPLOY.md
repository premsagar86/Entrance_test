# Deployment Guide

Complete guide to deploying the Aptitude Test Platform to production with Docker Compose (recommended), plus notes for non-Docker and managed hosting.

## 1. Architecture

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

## 2. Prerequisites

- A Linux VPS: **2 vCPU / 2 GB RAM minimum** (4 GB if many students test at once), 20 GB disk. Ubuntu 22.04/24.04 assumed.
- A **domain name** with an `A` record pointing to the server's public IP (e.g. `tests.example.com`).
- Ports **80 and 443** open (Let's Encrypt needs both).
- Docker Engine and the Compose plugin:
  ```bash
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER   # log out and back in
  docker compose version
  ```

## 3. Third-party services

| Service | Needed? | What to do |
|---|---|---|
| **Brevo** (or Resend) | Yes, for admin OTP emails | Create an account, verify a sender address/domain, create an API key. `MAIL_FROM` must be the verified sender. Without a provider, OTPs print to the server logs only. |
| **Cloudflare Turnstile** | Strongly recommended | Dashboard -> Turnstile -> add your domain. Copy the site key and secret key. |
| **Google Gemini** | Optional | Only a fallback for parsing scanned PDFs/images. Create a key in Google AI Studio. |

## 4. Get the code and configure

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
| `SEED_ADMIN_PHONE` | Yes | First admin's phone, 8-15 digits (e.g. `919876543210`). Used together with the emailed OTP. |
| `BREVO_API_KEY` or `RESEND_API_KEY` | Yes (prod) | Mail provider key. |
| `MAIL_FROM` | Yes (prod) | Verified sender address. |
| `TURNSTILE_SECRET` | Recommended | Server-side Turnstile key. |
| `TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Recommended | Site key (set both to the same value). The public one is baked in **at build time**, so rebuild after changing it. |
| `GEMINI_API_KEY` | Optional | Scanned-document fallback. |
| `DEV_SKIP_ADMIN_OTP` | No | Keep `false` (ignored in production anyway). |
| `STORAGE_DIR` | No | Set by compose to `/app/storage` (the `uploads` volume). |
| `R2_*` | No | Reserved and currently unused. Uploads use the local volume. |

Lock the file down: `chmod 600 .env`. **Never commit `.env`.**

## 5. First deploy

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

## 6. Smoke test

1. Open `https://<DOMAIN>/admin/login`, enter the admin email + phone, then the emailed code.
2. **Students**: import a CSV roster or add one student.
3. **Documents**: upload a question file, review the parsed questions and set the answer key.
4. **Tests**: create a test, set duration and window, assign students, publish.
5. In a private window, log in as a student, take the test, submit and check the result page.
6. Back in admin: check ranked results, and the integrity data (tab switches) at `/api/admin/tests/<id>/analytics`.
7. Confirm an uploaded file survives `docker compose restart app`.

## 7. Updating

```bash
git pull
scripts/backup.sh                                   # always back up first
docker compose build
docker compose --profile tools run --rm migrate     # apply new migrations
docker compose up -d                                # recreates changed containers
curl -s https://<DOMAIN>/api/health
```

**Rollback:** check out the previous tag, rebuild and `docker compose up -d`. Migrations are forward-only: if the release added a migration, restore the pre-update database backup (section 8) before rolling back the code.

## 8. Backups and restore

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

## 9. Security hardening

- Firewall: allow only 22, 80, 443.
  ```bash
  sudo ufw default deny incoming && sudo ufw allow 22,80,443/tcp && sudo ufw enable
  ```
- SSH: key-only login, no password or root login.
- Keep `DEV_SKIP_ADMIN_OTP=false`; use a real mail provider and Turnstile.
- Keep `.env` out of git, mode `600`. Rotate `SESSION_SECRET` and API keys if leaked (never `DOB_PEPPER`).
- Enable unattended security updates: `sudo apt install unattended-upgrades`.
- The app already sets HSTS, a nonce-based CSP and frame/referrer/permissions headers, and rate-limits login and OTP.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests, build and `npm audit`; accept Dependabot updates.
- Before a large live exam, load-test login + autosave (e.g. k6) at your expected concurrency, and scan a staging copy (e.g. OWASP ZAP). These are not automated in this repo.

## 10. Operations

- **Logs:** `docker compose logs -f app` (add `--since 1h`). Caddy: `docker compose logs caddy`.
- **Health:** `/api/health` returns 200 `ok`, or 503 `degraded` if the DB is unreachable. Point an uptime monitor (UptimeRobot, Better Stack) at it.
- **Maintenance mode:** post a `MAINTENANCE` announcement in the admin panel; it blocks starting new tests while running ones continue.
- **Exam day:** take a backup, check disk space (`df -h`), confirm health, keep `docker compose logs -f app` open.
- **Disk:** check with `docker system df`; run `docker image prune -f` after updates.

## 11. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Caddy can't get a certificate | DNS `A` record not pointing at the server, or ports 80/443 blocked. See `docker compose logs caddy`. |
| `set POSTGRES_PASSWORD` error | `POSTGRES_PASSWORD` missing in `.env`. |
| App restarts; logs show Zod/env errors | `SESSION_SECRET` / `DOB_PEPPER` missing or shorter than 32 chars. |
| Admin OTP never arrives | Mail key or `MAIL_FROM` missing/unverified. The app falls back to printing the code in `docker compose logs app`. |
| Students can't log in after a change | `DOB_PEPPER` was changed. Restore the original value. |
| Turnstile widget missing | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` was set after build; run `docker compose build --no-cache app`. |
| Uploads vanish after redeploy | Volume not mounted; `docker compose config` should show `uploads:/app/storage`. |
| `P1001` can't reach database | db not healthy yet; check `docker compose ps` and retry the migrate step. |
| Uploaded document fails to parse | Scanned file with no `GEMINI_API_KEY`; use a text-based DOCX/PDF/XLSX or set the key. |

## 12. Alternatives

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
- Hosts with a **persistent disk** (Railway, Render, Fly.io) work; mount a volume at `STORAGE_DIR`. Serverless hosts (Vercel) do **not** work until uploads are moved to object storage (R2/S3), which is not implemented yet.
- Run `npx prisma migrate deploy` as the release command, and seed the admin once.
