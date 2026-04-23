# Dag Detail — Uurblokken sync & UI verbetering

**Datum:** 2026-04-23

## Doel

De dag detail modal overzichtelijker maken en teamleden (assignees) zichtbaar tonen in de uurblokken sectie.

## Wijzigingen

### 1. Snelle taak verwijderen

Het grote "Snelle taak" formulierblok bovenin de Taken sectie wordt verwijderd. Vervangen door een kleine "+ Nieuw" knop rechts in de sectieheader naast "Taken". Die knop opent hetzelfde formulier (gecomprimeerde staat), maar dan inline onder de header in plaats van als permanent blok.

**Bestand:** `src/components/weekplanner/DayDetailModal.tsx`

### 2. Assignees toevoegen aan HourBlockDisplayGroup

Het type `HourBlockDisplayGroup` krijgt een extra veld:

```ts
assignees: string[]
```

De groepeerfunctie `groupHourBlocksForDisplay` vult dit met alle unieke assignee-namen van de blokken in de groep (zelfde patroon als `taskLabels`). Bij samenvoegen van blokken worden nieuwe namen toegevoegd als ze er nog niet in staan.

**Bestanden:**
- `src/components/weekplanner/types.ts` — veld toevoegen
- `src/components/WeekplannerApp.tsx` — aggregatie in `groupHourBlocksForDisplay` en `createHourBlockDisplayGroup`

### 3. Assignees tonen in DayDetailModal

Per uurblok-kaart in de modal: als `assignees` niet leeg is, toon een rij pills onderaan de kaart. Per persoon: gekleurd initialen-rondje (18×18px) + naam ernaast, verpakt als één pill met witte achtergrond en gekleurde rand.

Kleur per persoon: deterministisch afgeleid van de naam via een eenvoudige hash → index in een vaste kleurenreeks (bijv. blauw, paars, groen, rood, oranje). Zo heeft Jan altijd dezelfde kleur in alle blokken.

**Bestand:** `src/components/weekplanner/DayDetailModal.tsx`

## Wat niet verandert

- 3-koloms layout van de modal
- Bewerkbare taakvelden (title, info, priority, deadline)
- Urenregistratie sectie
- Alle bestaande sync-logica (deadline, status, labels)
- Geen API- of databasewijzigingen

## Bestanden geraakt

| Bestand | Wijziging |
|---|---|
| `src/components/weekplanner/types.ts` | `assignees` veld aan `HourBlockDisplayGroup` |
| `src/components/WeekplannerApp.tsx` | Aggregatie in `groupHourBlocksForDisplay` / `createHourBlockDisplayGroup` |
| `src/components/weekplanner/DayDetailModal.tsx` | Snelle taak weg, assignee pills toegevoegd |
