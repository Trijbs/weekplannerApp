# Tijdregistratie — implementatieplan (feat/tijdregistratie)

Doel: de bestaande "Uren"-tab ombouwen tot Tijdregistratie-hub met timer,
sync vanuit planner/uurblokken, slimme herinneringen, projectbudgetten en
exportcentrum (xlsx/csv/pdf). Databehoud van bestaande `hour_entries` is een
harde eis: uitsluitend additieve migraties.

## Ontwerpbeslissingen

- `HourEntry` wordt uitgebreid (géén parallelle tabel): `startedAt`, `stoppedAt`,
  `hourBlockId`, `dayTaskId`, `status` ("running" | "registered", default
  "registered"). Bestaande rijen blijven intact en krijgen impliciet
  "registered" via kolom-default.
- `hoursDecimal` blijft de bron van waarheid voor duur (bewerkbaar achteraf);
  bij timer-stop wordt hij berekend uit startedAt→stoppedAt. Geen aparte
  durationMinutes-kolom (zou dubbele staat zijn).
- Check-constraint `hours_decimal > 0` wordt versoepeld naar `>= 0` zodat een
  lopende timer met 0 uur kan bestaan (niet-destructief).
- Nieuwe tabel `project_budgets` (project_name uniek, budget_hours).
- Max één lopende timer: `startHourTimer` stopt+registreert een eventueel
  lopende timer atomair in de repository-laag.
- Pure logica in `src/lib/time/tracking.ts` (TDD): duurberekening,
  "2u 17m"-formattering, budgetstatus (groen/geel/rood), herinnering-afleiding,
  export-aggregatie. Eén aggregatiefunctie, drie renderers (xlsx/csv/pdf).
- PDF via `@react-pdf/renderer`, server-side in de API-route.

## Fase 1 — Datamodel & timer-fundament
- [ ] Tests: `src/tests/time-tracking.test.ts` (duur, formattering, clamps)
- [ ] Lib: `src/lib/time/tracking.ts`
- [ ] Migratie: `db/migrations/20260713_time_tracking.sql` (additief)
- [ ] Types: `HourEntry` + inputs/patches + `ProjectBudget` in `src/lib/db/types.ts`
- [ ] Zod-schema's in `src/lib/api/schemas.ts`
- [ ] Repository-interface + local + neon: timer- en budgetmethodes
- [ ] API: `/api/hours/timer` (GET lopend, POST start, POST stop)

## Fase 2 — UI Tijdregistratie-tab
- [ ] Tab-label "Uren" → "Tijdregistratie" (key blijft `hours`)
- [ ] `src/components/tijdregistratie/TimerSection.tsx` — vandaag-items uit
      planner/uurblokken met ▶ Start timer / ⏹ Stop, lopende timer bovenaan,
      "2u 17m" + "✓ Geregistreerd" na stoppen
- [ ] Timer overleeft refresh (lopende entry komt uit DB) en offline (queue)
- [ ] Samenvattingskaarten: vandaag gewerkt / deze week / per project

## Fase 3 — Slimme herinneringen
- [ ] Tests: herinnering-afleiding (klaar zonder uren, verstreken blok, dagteller)
- [ ] `RemindersBanner.tsx` + badge op tab-knop; [Nu registreren] opent
      voorgevuld formulier; dismissed-vlag client-side

## Fase 4 — Projectbudgetten
- [ ] Tests: budgetstatus-drempels (<85% groen, 85–100% geel, >100% rood)
- [ ] Repository + API `/api/project-budgets`
- [ ] `ProjectBudgets.tsx`: beheer + voortgangsbalk "18 / 40 uur" + status

## Fase 5 — Exportcentrum
- [ ] Tests: export-aggregatie (filters dag/week/maand/project/bereik, subtotalen)
- [ ] `src/lib/export/hours.ts` (aggregatie) + renderers xlsx/csv/pdf
- [ ] `@react-pdf/renderer` dependency; PDF-layout in `src/lib/export/pdf/`
- [ ] API `/api/export/hours?format=…` + `ExportCenter.tsx` in de tab

## Afronding
- [ ] `npm run test`, `npm run build`, `npm run lint` groen
- [ ] Databehoud geverifieerd (count + steekproef vóór/ná migratie)
- [ ] Bestaande hours-functionaliteit ongewijzigd
- [ ] Commits per fase; push; PR met preview-URL; NIET mergen

## Review
(in te vullen na afronding)
