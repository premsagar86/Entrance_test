# Aptitude Test Platform

Timed MCQ entrance/aptitude exams. Admins upload question documents, review and publish tests, assign them to a pre-registered student roster and view ranked results. Students log in with Email + DOB (or Roll No), take a server-timed test and see their result.

**Stack:** Next.js 14 (App Router), TypeScript, Prisma + PostgreSQL, Tailwind. Parsers: DOCX, PDF, XLSX/CSV, with an optional Gemini fallback for scanned files.

## Local development

```bash
cp .env.example .env          # fill DATABASE_URL, SESSION_SECRET, DOB_PEPPER, SEED_ADMIN_*
npm ci --legacy-peer-deps
npx prisma migrate deploy
npm run db:seed               # creates the admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PHONE
npm run dev                   # http://localhost:3000
```

The admin signs in with email + phone number (the phone number acts as the password). No code is emailed.

## Scripts

| Command | Purpose |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `npm run lint` | Static checks |
| `npm run db:seed` / `npm run db:demo` | Seed the admin / demo data |
| `npm run cleanup` | Expire abandoned attempts, purge old sessions/OTPs |
| `scripts/backup.sh` | Back up the database and uploads (Docker deployment) |

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for the complete production guide.
