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
- GitHub Actions scheduled sync for Google Drive
- Render free web service for hosting

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
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional local variables:
- `LOCAL_DB_PATH`
- `NEXT_ALLOWED_DEV_ORIGINS`
- `NODE_VERSION`

## Database behavior
The app selects the database implementation in this order:
1. Neon/Postgres via `DATABASE_URL`
2. Legacy Neon/Postgres fallback via `NETLIFY_DATABASE_URL`
3. Supabase via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
4. Local JSON fallback for development

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

## Render deployment
This repo includes [render.yaml](./render.yaml) for a free Render web service.

Render runtime values to set:
- `DATABASE_URL`
- `TOKEN_ENCRYPTION_KEY`
- `CRON_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_DRIVE_FOLDER_ID`
- `APP_BASE_URL=https://<your-service>.onrender.com`
- `NEXT_PUBLIC_APP_URL=https://<your-service>.onrender.com`
- `GOOGLE_REDIRECT_URI=https://<your-service>.onrender.com/api/integrations/google-drive/callback`
- `NODE_VERSION=20`

Build/start:
- Build: `npm ci && npm run build`
- Start: `npx next start --hostname 0.0.0.0 --port $PORT`
- Health check: `/api/auth/pin/status`

## GitHub Actions hourly sync
This repo includes [hourly-sync.yml](./.github/workflows/hourly-sync.yml).

GitHub repo settings required:
- Repository variable: `APP_BASE_URL=https://<your-service>.onrender.com`
- Repository secret: `CRON_SECRET=<same secret as Render>`

Behavior:
- Runs each hour at minute `17`
- Supports `workflow_dispatch`
- Retries the cron endpoint 3 times to tolerate cold starts

## Google OAuth
Authorized redirect URI must be set to:
- `https://<your-service>.onrender.com/api/integrations/google-drive/callback`

After changing the redirect URI, reconnect Google Drive from the production site.

## Schema setup for Neon
Apply the SQL schema with:
```bash
npm run db:neon:init
```

The script accepts:
- `DATABASE_URL`
- legacy fallback `NETLIFY_DATABASE_URL`

## Migration helper
If you still need the one-time Supabase -> Neon migration script, it accepts:
- `DATABASE_URL`
- legacy fallback `NETLIFY_DATABASE_URL`
- plus `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

## Tests
```bash
npm run lint
npm run test
npm run build
```

## Notes
- UI is Dutch and Monday-Friday by default.
- Render free services can cold-start after inactivity.
- GitHub scheduled workflows on public repos may need re-enabling after long inactivity.
