# Weekplanner Web App

Dutch-first weekplanner PWA with:
- 6-digit PIN login
- Week tasks (`titel`, `info`, `deadline`, `prioriteit`, `status`)
- Hour blocks (`Uurblokken`)
- Day-linked hour registration (`Urenregistratie`) with totals per week/day/project
- Automatic history notes on create/update/delete
- Excel import (`.xlsx`) + Google Drive sync
- CSV export of the current week

## Stack
- Next.js 16 + TypeScript + Tailwind
- Neon/Postgres via the `@netlify/neon` SQL client
- Local JSON fallback for development only when no remote DB env vars are set
- Vercel hosting with Vercel Analytics
- GitHub Actions scheduled sync for Google Drive

## Local run
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables
Primary runtime variables:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `APP_BASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `GOOGLE_REDIRECT_URI`

Legacy fallbacks still supported by the code:
- `NETLIFY_DATABASE_URL`

Optional local variables:
- `LOCAL_DB_PATH`
- `NEXT_ALLOWED_DEV_ORIGINS`
- `NODE_VERSION`

## Database behavior
The app selects the database implementation in this order:
1. Neon/Postgres via `DATABASE_URL`
2. Legacy Neon/Postgres fallback via `NETLIFY_DATABASE_URL`
3. Local JSON fallback for development

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
- `POST /api/cron/sync-drive` (requires `Authorization: Bearer <CRON_SECRET>`)

## Vercel deployment
Set these Production environment variables in Vercel:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `APP_BASE_URL=https://weekplanner.trijbsworld.nl`
- `NEXT_PUBLIC_APP_URL=https://weekplanner.trijbsworld.nl`
- `GOOGLE_REDIRECT_URI=https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback`
- `NODE_VERSION=20` (optional locally; Vercel manages Node for deployment)

Vercel setup:
1. Import the repository as a Vercel project.
2. Add `weekplanner.trijbsworld.nl` as the production domain in Vercel.
3. Point the `weekplanner` DNS record at the Vercel target shown in the project domain settings.
4. Redeploy after environment variables are in place.

## Vercel Analytics
This app uses `@vercel/analytics` from the root layout, so page views start being tracked after deployment.

To see data in Vercel:
1. Deploy the latest changes.
2. Visit the production site and navigate between pages.
3. Check Analytics in the Vercel dashboard after a short delay.

## GitHub Actions hourly sync
This repo includes [hourly-sync.yml](./.github/workflows/hourly-sync.yml).

GitHub repo settings required:
- Repository variable: `APP_BASE_URL=https://weekplanner.trijbsworld.nl`
- Repository secret: `CRON_SECRET=<same secret as the Vercel app env>`

Behavior:
- Runs each hour at minute `17`
- Supports `workflow_dispatch`
- Retries the cron endpoint 3 times

## Google OAuth
Authorized redirect URI must be set to:
- `https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback`

After changing the redirect URI, reconnect Google Drive from the production site.

## Schema setup for Neon
Apply the SQL schema with:
```bash
npm run db:neon:init
```

The script accepts:
- `DATABASE_URL`
- legacy fallback `NETLIFY_DATABASE_URL`

## Tests
```bash
npm run lint
npm run test
npm run build
```

## Notes
- UI is Dutch and Monday-Friday by default.
- Vercel Hobby keeps hosting simple, but the hourly sync remains in GitHub Actions.
- GitHub scheduled workflows on public repos may need re-enabling after long inactivity.
