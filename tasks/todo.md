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
- [x] Tests: `src/tests/time-tracking.test.ts` (duur, formattering, clamps)
- [x] Lib: `src/lib/time/tracking.ts`
- [x] Migratie: `db/migrations/20260713_time_tracking.sql` (additief)
- [x] Types: `HourEntry` + inputs/patches + `ProjectBudget` in `src/lib/db/types.ts`
- [x] Zod-schema's in `src/lib/api/schemas.ts`
- [x] Repository-interface + local + neon: timer- en budgetmethodes
- [x] API: `/api/hours/timer` (GET lopend, POST start, POST stop)

## Fase 2 — UI Tijdregistratie-tab
- [x] Tab-label "Uren" → "Tijdregistratie" (key blijft `hours`)
- [x] `src/components/tijdregistratie/TimerSection.tsx` — vandaag-items uit
      planner/uurblokken met ▶ Start timer / ⏹ Stop, lopende timer bovenaan,
      "2u 17m" + "✓ Geregistreerd" na stoppen
- [x] Timer overleeft refresh (lopende entry komt uit DB) en offline (queue)
- [x] Samenvattingskaarten: vandaag gewerkt / deze week / per project

## Fase 3 — Slimme herinneringen
- [x] Tests: herinnering-afleiding (klaar zonder uren, verstreken blok, dagteller)
- [x] `RemindersBanner.tsx` + badge op tab-knop; [Nu registreren] opent
      voorgevuld formulier; dismissed-vlag client-side (localStorage)

## Fase 4 — Projectbudgetten
- [x] Tests: budgetstatus-drempels (<85% groen, 85–100% geel, >100% rood)
- [x] Repository + API `/api/project-budgets`
- [x] `ProjectBudgets.tsx`: beheer + voortgangsbalk "18 / 40 uur" + status

## Fase 5 — Exportcentrum
- [x] Tests: export-aggregatie (filters dag/week/maand/project/bereik, subtotalen)
- [x] `src/lib/export/hours.ts` (aggregatie) + renderers xlsx/csv/pdf
- [x] `@react-pdf/renderer` dependency; PDF-layout in `src/lib/export/pdf/`
- [x] API `/api/export/hours?format=…` + `ExportCenter.tsx` in de tab

## Afronding
- [x] `npm run test` (195/199; 4 failures bestonden al op main), build en lint groen
- [x] Databehoud geverifieerd op Neon: 111 → 111 rijen, som 640,00 → 640,00 uur,
      steekproef identiek, alle bestaande rijen status='registered'
- [x] Bestaande hours-functionaliteit ongewijzigd (formulier, filters, summaries)
- [x] Commits per fase; push; PR met preview; NIET mergen

## Review

- Migratie 20260713_time_tracking.sql draaide schoon op Neon (15/15 statements).
- `hoursDecimal` blijft de bron van waarheid voor duur; timer-stop berekent hem
  uit startedAt→stoppedAt. Geen aparte durationMinutes-kolom (geen dubbele staat).
- Max één lopende timer wordt in de repository-laag afgedwongen: starten stopt
  en registreert een eventuele lopende timer atomair.
- 4 vooraf bestaande testfailures op main (csv/excel-parser einddatum vr→zo en
  één notes-export-tijdzonetest) zijn buiten scope gelaten.
- Aansluitpunten voor toekomstige modules (dashboard/offertes/facturen):
  `getProjectHourTotals()`, `listHourEntriesByRange()`, `budgetStatus()` en
  `buildHoursExport()` zijn de herbruikbare bouwstenen.
