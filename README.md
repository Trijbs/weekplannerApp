# Weekplanner Web App

Weekplanner is a Dutch-first PWA for weekly planning and hour tracking. It runs at [weekplanner.trijbsworld.nl](https://weekplanner.trijbsworld.nl) and supports PIN login, week tasks, hour blocks, day-linked time registration, CSV export, manual Excel import, Google Drive sync, an offline mutation queue, and a built-in Dutch/English language switcher.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| Language | TypeScript |
| Database | Neon Postgres via `@netlify/neon` |
| Hosting | Vercel |
| Analytics | Vercel Analytics (`@vercel/analytics`) |
| CI / Sync | GitHub Actions |
| Security | CodeQL (Advanced Setup, `codeql-action@v4`) |

---

## Features

### Planning
- Weekly planner for Monday through Sunday
- Day tasks with priority levels (high / medium / low) shown as color-coded left borders
- Task status badges: Open (grey), Bezig (blue), Klaar (green)
- Two-step delete confirmation on all tasks (2-second auto-reset)
- Inline task editing with amber focus-ring feedback
- Progressive disclosure task form — title + weekday always visible, extra fields (info, deadline, time, priority) behind a `+` toggle

### Hour registration
- Day-linked time entries with project/category field
- Hour calculator (start time → end time → decimal hours)
- Per-day reflection notes (compact or expanded mode)
- Hours summary: total visible, active week total, weeks with hours
- Per-project accordion with rotating SVG chevron animation
- Period filter (all / this week / specific day) with smooth slide-in date input
- Merge projects: rename and consolidate entries across weeks

### Hour blocks (time boxing)
- Named blocks with start/end times per day
- Multi-day blocks and assignees
- Now-active block: pulsing green border + animated dot indicator

### Gedachten (thought inbox)
- Multi-thread thought inbox with conversations grouped by date: Vandaag / Afgelopen 7 dagen / Eerder
- Auto-summarisation after saving: extracts core overview, actions, ideas, and planning notes
- Per-action day selector — each action from a summary has its own independent weekday picker
- One-click "Zet in planner" promotes a thought action directly to a task

### Search & navigation
- Day search: pick any date and jump to that day's detail modal
- Full-text planner search across tasks, projects, and reflections
- Search results show day, week, match count, and preview chips
- Compact single-line search bar in header (not a tall panel)

### Offline-first
- All mutations go through an IndexedDB offline queue
- Queue flushes automatically when back online (`window.addEventListener('online')`)
- Queue count polled every 3 seconds and on tab focus (`visibilitychange`)
- Amber pulsing chip + spinning sync icon when queue > 0; chip hidden entirely when empty
- Online/Offline indicator with live coloured dot (green / amber)

### Loading & empty states
- Branded loading screen: 5 animated week-column bars (M D W D V) with staggered `animate-pulse`
- Empty states for tasks, hour blocks, and hour entries — each with an icon and contextual hint

### PWA
- Offline-capable via service worker
- Mobile-first responsive layout
- Horizontal scrollable tab strip (no wrapping) for all screen sizes

---

## UI/UX highlights

- **Day cards**: show done/total task count badge (e.g. `2/5`), "Vandaag" pill on today's card, green "✓ Klaar" when fully complete, hover border, no redundant helper text
- **Today card**: thicker `border-blue-400` with subtle shadow, blue weekday label, live clock
- **Mobile tab strip**: `overflow-x-auto` with hidden scrollbar — all tabs reachable by swipe
- **Header**: compact single-row search bars instead of tall description panels
- **Offline chip**: only renders when `queueCount > 0` or offline
- **Accordion chevrons**: SVG icon with `rotate-180` CSS transition
- **Match labels**: language-aware — "3 resultaten" (NL) / "3 matches" (EN)
- **Hour form**: all inputs have visible `<label>` elements above them

---

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

When `DATABASE_URL` is not set, the app falls back to a local JSON repository (`LOCAL_DB_PATH`).

---

## Environment variables

### Required (production)

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `TOKEN_ENCRYPTION_KEY` | AES key for encrypting OAuth tokens at rest |
| `CRON_SECRET` | Shared secret for the hourly Drive sync endpoint |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `APP_BASE_URL` | Full origin, e.g. `https://weekplanner.trijbsworld.nl` |
| `NEXT_PUBLIC_APP_URL` | Same value, exposed to the browser |
| `GOOGLE_REDIRECT_URI` | `https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback` |

### Optional

| Variable | Description |
|---|---|
| `LOCAL_DB_PATH` | Path to local JSON db for development without Neon |
| `NEXT_ALLOWED_DEV_ORIGINS` | Extra origins allowed in dev (CORS) |
| `NODE_VERSION` | Pin Node version for CI |

---

## Deployment

Production runs on Vercel at [weekplanner.trijbsworld.nl](https://weekplanner.trijbsworld.nl).

Set all required variables in the Vercel dashboard under **Settings → Environment Variables**.

The `/api/cron/sync-drive` route exports `maxDuration = 60` to stay within Vercel's serverless limit when downloading and parsing large Excel files.

---

## Hourly Google Drive sync

Handled by [`.github/workflows/hourly-sync.yml`](./.github/workflows/hourly-sync.yml) — not Vercel Cron.

**How it works:**
1. Workflow triggers every hour at minute `17` (or manually via `workflow_dispatch`)
2. `curl` POSTs to `/api/cron/sync-drive` with `Authorization: Bearer $CRON_SECRET`
3. The endpoint lists all `.xlsx` and `.csv` files in the configured Drive folder
4. Files already imported at the same `modifiedTime` are skipped
5. New or updated files are downloaded, parsed, and upserted into the database
6. Retries up to 3 times with a 20-second delay between attempts

**Resilience improvements:**
- All Google API `fetch` calls have a 30-second `AbortController` timeout
- Drive file listing follows `nextPageToken` pagination (no 100-file cap)
- Refresh token rotation: if Google returns a new refresh token during token refresh, it is saved immediately

**GitHub repository settings required:**

| Type | Name | Value |
|---|---|---|
| Variable | `APP_BASE_URL` | `https://weekplanner.trijbsworld.nl` |
| Secret | `CRON_SECRET` | Same value as the Vercel env var |

If `APP_BASE_URL` is missing or still points to an old `onrender.com` host, the workflow falls back to `https://weekplanner.trijbsworld.nl`.

---

## Google OAuth

Authorised redirect URI:
```
https://weekplanner.trijbsworld.nl/api/integrations/google-drive/callback
```

After changing OAuth settings in the Google Cloud Console, reconnect Google Drive from the production app (Menu → Koppel Drive).

---

## CodeQL security scanning

CodeQL analysis runs on every push and pull request to `main`, and weekly on Mondays.

Workflow: [`.github/workflows/codeql.yml`](./.github/workflows/codeql.yml)

Uses `github/codeql-action@v4` with advanced setup (default setup is disabled in repository settings).

---

## Database

Apply the base Neon schema:
```bash
npm run db:neon:init
```

The script reads `DATABASE_URL`. Migration SQL lives in `db/migrations/`.

---

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Run tests
npm run db:neon:init # Apply database schema to Neon
```

---

## API overview

### Auth
- `POST /api/auth/pin/setup`
- `POST /api/auth/pin/login`
- `POST /api/auth/pin/logout`
- `GET  /api/auth/pin/status`

### Weeks & tasks
- `GET         /api/weeks/current`
- `POST        /api/weeks/:id/tasks`
- `PATCH|DELETE /api/tasks/:id`

### Hour blocks
- `POST         /api/weeks/:id/hour-blocks`
- `PATCH|DELETE /api/hour-blocks/:id`

### Hour entries
- `GET|POST      /api/weeks/:id/hours`
- `GET           /api/weeks/:id/hours/summary`
- `PATCH|DELETE  /api/hours/:id`

### Thoughts
- `GET|POST  /api/thoughts/threads`
- `GET|POST  /api/thoughts/threads/:id/messages`
- `POST      /api/thoughts/threads/:id/summarize`

### Import & export
- `POST /api/import/manual`
- `POST /api/import/sync`
- `GET  /api/export/csv?weekId=...`

### Integrations
- `POST /api/integrations/google-drive/connect`
- `GET  /api/integrations/google-drive/callback`

### Cron
- `POST /api/cron/sync-drive` ← called by GitHub Actions hourly

---

## Architecture notes

**Offline queue** (`src/lib/client/offline-queue.ts`): mutations are stored in IndexedDB as a queue. `flushMutationQueue` reads all items first, fires all `fetch` calls, then opens a fresh IDB transaction to delete only the ones that succeeded — avoiding the IDB auto-commit problem that occurs when `await fetch()` runs inside an open transaction.

**Repository pattern**: `src/lib/db/repository.ts` exports a single `db` object. The concrete implementation is selected at runtime — `repository.neon.ts` for production (Neon Postgres) and `repository.local.ts` for local development (JSON file). Both implement the same interface defined in `repository.interface.ts`.

**Language**: UI strings run through `translateStatic(language, text)`. The language preference is stored in `localStorage` under `weekplanner.language`. Dutch is the default.

---

## Notes

- The planner covers Monday through Sunday (all seven days).
- All dates and times use the `Europe/Amsterdam` timezone by default; this is configurable from the header menu.
- Vercel Hobby is used for hosting; the hourly Drive sync stays in GitHub Actions by design (Vercel Hobby does not support cron jobs).
