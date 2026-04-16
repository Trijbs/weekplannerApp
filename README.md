# Weekplanner Web App

Weekplanner is a Dutch-first PWA for weekly planning and hour tracking. It supports PIN login, week tasks, hour blocks, day-linked time registration, CSV export, manual Excel import, Google Drive sync, and a built-in Dutch/English language switcher.

## Stack
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Neon Postgres via `@netlify/neon`
- Vercel hosting with Vercel Analytics
- GitHub Actions for hourly Drive sync

## Features
- Weekly planner for Monday through Friday
- Day tasks, grouped hour blocks, and day-linked time registration
- PIN-protected access
- CSV export, notes export, manual Excel import, and Google Drive sync
- Dutch and English UI with a header language switcher

## Local development
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables
Required runtime variables:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `APP_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_REDIRECT_URI`

Optional variables:
- `LOCAL_DB_PATH`
- `NEXT_ALLOWED_DEV_ORIGINS`
- `NODE_VERSION`

Notes:
- `DATABASE_URL` is the primary Neon connection string.
- `NETLIFY_DATABASE_URL` is still accepted by the code as a legacy fallback.
- When no database env var is present, the app falls back to the local JSON repository for development.
- UI language preference is stored locally in `weekplanner.language`.

## Deployment
Production runs on Vercel at [weekplanner.trijbsworld.nl](https://weekplanner.trijbsworld.nl).

Set these production environment variables in Vercel:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `APP_BASE_URL=https://weekplanner.trijbsworld.nl`
- `NEXT_PUBLIC_APP_URL=https://weekplanner.trijbsworld.nl`
- `GOOGLE_REDIRECT_URI=https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback`

Vercel Analytics is enabled from the root layout via `@vercel/analytics`.

## Hourly sync
Hourly Google Drive sync is handled by [hourly-sync.yml](./.github/workflows/hourly-sync.yml), not Vercel Cron.

GitHub repository settings:
- Variable: `APP_BASE_URL=https://weekplanner.trijbsworld.nl`
- Secret: `CRON_SECRET=<same value as the Vercel env>`

Safety fallback:
- If `APP_BASE_URL` is missing or still points to an old `onrender.com` host, the workflow falls back to `https://weekplanner.trijbsworld.nl`.

Behavior:
- runs every hour at minute `17`
- supports manual `workflow_dispatch`
- retries the cron endpoint up to 3 times

## Google OAuth
Authorized redirect URI:
- `https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback`

After changing OAuth settings, reconnect Google Drive from production.

## Database schema
Apply the base Neon schema with:
```bash
npm run db:neon:init
```

The script reads `DATABASE_URL` first and accepts `NETLIFY_DATABASE_URL` as a legacy fallback.

Migration SQL lives in [db/migrations](/Users/trijbs/TrijbsCoding/Planning schema/weekplanner-app/db/migrations:1).

## Scripts
```bash
npm run dev
npm run lint
npm run test
npm run build
npm run db:neon:init
```

## API overview
- `POST /api/auth/pin/setup`
- `POST /api/auth/pin/login`
- `POST /api/auth/pin/logout`
- `GET /api/weeks/current`
- `POST /api/weeks/:id/tasks`
- `PATCH|DELETE /api/tasks/:id`
- `POST /api/weeks/:id/hour-blocks`
- `PATCH|DELETE /api/hour-blocks/:id`
- `GET|POST /api/weeks/:id/hours`
- `GET /api/weeks/:id/hours/summary`
- `PATCH|DELETE /api/hours/:id`
- `POST /api/import/manual`
- `POST /api/import/sync`
- `POST /api/integrations/google-drive/connect`
- `GET /api/integrations/google-drive/callback`
- `GET /api/export/csv?weekId=...`
- `POST /api/cron/sync-drive`

## Notes
- The planner is Monday-Friday by default.
- The UI starts in Dutch and can be switched to English from the header.
- Vercel Hobby is used for hosting; the hourly sync stays in GitHub Actions by design.
