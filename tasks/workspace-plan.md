# Weekplanner Workspace — Geoptimaliseerd Implementatieplan

## Overzicht

Voeg een **Workspace** tab toe aan de Weekplanner: een volledig aanpasbaar dashboard waarop de gebruiker widgets kan plaatsen, verplaatsen, resizen en configureren. Elke widget haalt zijn eigen data op.

---

## Architecturbeslissingen

| Beslissing | Keuze | Rationale |
|---|---|---|
| Navigatie | Nieuwe tab | Past bij bestaand tab-systeem, geen route-brekende wijziging |
| Grid engine | `react-grid-layout` v2.2.4 | Battle-tested, drag+resize+collision out-of-the-box, responsive breakpoints. v2 = volledig TypeScript + React 18+ compatible |
| Widget data | Eigen data fetching per widget | Losgekoppeld van `WeekplannerApp` payload, flexibeler |
| Persistantie | localStorage (MVP) | Simpel, direct bruikbaar, architectuur klaar voor server-sync |
| Styling | Tailwind CSS (bestaand) | Consistent met huidige codebase |

---

## Fase 1: Workspace Engine

### Stap 1.1 — Dependencies installeren

```bash
npm install react-grid-layout
npm install -D @types/react-grid-layout
```

### Stap 1.2 — Type definities

**`src/components/workspace/types.ts`**

```typescript
import type { ComponentType } from "react";

export type WidgetType =
  | "today"
  | "todo"
  | "week-overview"
  | "hours"
  | "hours-per-project"
  | "agenda"
  | "notes"
  | "deadlines"
  | "stats"
  | "focus"
  | "quick-actions"
  | "priorities"
  | "coming-tasks";

export interface WidgetConfig {
  [key: string]: unknown;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  locked: boolean;
  visible: boolean;
  config: WidgetConfig;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  category: "planning" | "uren" | "taken" | "persoonlijk";
  component: ComponentType<WidgetProps>;
  defaultConfig: WidgetConfig;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
}

export interface WidgetProps {
  instance: WidgetInstance;
  onUpdateConfig: (config: WidgetConfig) => void;
}

export interface WorkspaceLayout {
  id: string;
  name: string;
  isDefault: boolean;
  widgets: WidgetInstance[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceState {
  layouts: WorkspaceLayout[];
  activeLayoutId: string;
  isEditMode: boolean;
}
```

### Stap 1.3 — Widget Registry

**`src/components/workspace/registry.ts`**

Centrale registry die alle beschikbare widgets beschrijft. Elke nieuwe widget wordt hier geregistreerd en is automatisch beschikbaar in de "+ Widget" library.

```typescript
// Conceptueel: registreer elke widget
const WIDGET_REGISTRY: WidgetDefinition[] = [
  {
    type: "today",
    name: "Vandaag",
    description: "Taken van vandaag met voortgang",
    icon: "📅",
    category: "planning",
    component: TodayWidget,
    defaultConfig: { showTime: true },
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    maxSize: { w: 6, h: 6 },
  },
  // ... meer widgets
];

export function getWidgetDefinition(type: WidgetType): WidgetDefinition | undefined { ... }
export function getWidgetsByCategory(category: string): WidgetDefinition[] { ... }
export function getAllWidgets(): WidgetDefinition[] { ... }
```

### Stap 1.4 — Workspace Context

**`src/components/workspace/WorkspaceContext.tsx`**

```typescript
interface WorkspaceContextValue {
  state: WorkspaceState;
  activeLayout: WorkspaceLayout;
  isEditMode: boolean;
  // Layout acties
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number; w: number; h: number }) => void;
  updateWidgetConfig: (id: string, config: WidgetConfig) => void;
  toggleWidgetLock: (id: string) => void;
  duplicateWidget: (id: string) => void;
  // Workspace acties
  setEditMode: (edit: boolean) => void;
  switchLayout: (layoutId: string) => void;
  createLayout: (name: string, fromTemplate?: string) => void;
  deleteLayout: (id: string) => void;
  resetLayout: () => void;
}
```

### Stap 1.5 — LocalStorage Persistence

**`src/components/workspace/persistence.ts`**

```typescript
const STORAGE_KEY = "weekplanner.workspace";

export function loadWorkspaceState(): WorkspaceState | null { ... }
export function saveWorkspaceState(state: WorkspaceState): void { ... }

// Debounced save — niet bij iedere pixelbeweging
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
export function debouncedSave(state: WorkspaceState): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveWorkspaceState(state), 500);
}
```

### Stap 1.6 — Grid Layout Component

**`src/components/workspace/WidgetGrid.tsx`**

```typescript
// Wrapper rond react-grid-layout
import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

// Breakpoints: desktop 12 cols, tablet 8 cols, mobiel 1 col
const BREAKPOINTS = { lg: 1200, md: 768, sm: 0 };
const COLS = { lg: 12, md: 8, sm: 1 };

// Render elke widget in een WidgetContainer
// WidgetContainer toont header + resize handles in edit mode
// Collison detection gebeurt automatisch door react-grid-layout
```

### Stap 1.7 — Widget Container

**`src/components/workspace/WidgetContainer.tsx`**

```typescript
// Wrapper rond elke widget
// - Header met drag handle (⋮⋮) + titel + menu (⋯)
// - Content area
// - Resize handles (alleen in edit mode)
// - Lock indicator (🔒)

interface WidgetContainerProps {
  definition: WidgetDefinition;
  instance: WidgetInstance;
  isEditMode: boolean;
  children: React.ReactNode;
}
```

### Stap 1.8 — Widget Library (Modal/Drawer)

**`src/components/workspace/WidgetLibrary.tsx`**

```typescript
// Modal die alle beschikbare widgets toont, gegroepeerd per categorie
// Klik op een widget → voeg toe aan huidige layout
// Toon max. aantal instances per widget-type (optioneel)
```

### Stap 1.9 — Workspace Header

**`src/components/workspace/WorkspaceHeader.tsx`**

```typescript
// [Bewerken / Klaar] [+ Widget] [Layout: ▼ Mijn dashboard] [⋯]
// In edit mode: extra opties (Reset layout, etc.)
```

### Stap 1.10 — Workspace Component (hoofdcomponent)

**`src/components/workspace/Workspace.tsx`**

```typescript
// Hoofdcomponent die alles samenbrengt:
// - WorkspaceContext provider
// - WorkspaceHeader
// - WidgetGrid met alle widgets
// - WidgetLibrary modal
// - WidgetSettings modal

export function Workspace() {
  return (
    <WorkspaceProvider>
      <WorkspaceHeader />
      <WidgetGrid />
      <WidgetLibrary />
    </WorkspaceProvider>
  );
}
```

### Stap 1.11 — Integratie in WeekplannerApp

**Wijzigingen in `src/components/WeekplannerApp.tsx`:**

```diff
- type Tab = "planner" | "hours" | "blocks" | "past" | "log" | "thoughts";
+ type Tab = "planner" | "hours" | "blocks" | "past" | "log" | "thoughts" | "workspace";

// Nieuwe tab-knop in nav:
+ <button onClick={() => setTab("workspace")}>Workspace</button>

// Nieuwe sectie in tab-content:
+ {tab === "workspace" && <Workspace />}
```

---

## Fase 2: Basis Widgets

Elke widget is een zelfstandig component met eigen data-fetching.

### Widget: Vandaag (`today`)
- Toont taken van vandaag
- Afgerond / open teller
- Totaal geplande tijd
- Data: eigen API call naar `/api/weeks/current`

### Widget: Todo (`todo`)
- Checkbox-lijst van taken
- Markeer als klaar/open
- Data: eigen API call

### Widget: Weekplanning (`week-overview`)
- Compact overzicht van de hele week
- Per dag: taken + uren
- Data: eigen API call

### Widget: Uren deze week (`hours`)
- Totaal uren / doeluren
- Voortgangsbalk
- Per project overzicht
- Data: eigen API call naar `/api/weeks/current` + uren summary

### Widget: Agenda (`agenda`)
- Compacte kalenderweergave
- Dag/week maand toggle
- Data: client-side calculatie op basis van huidige datum

### Widget: Notities (`notes`)
- Vrije tekst editor
- Opslag in localStorage (per widget instance)
- Data: lokaal

### Widget: Deadlines (`deadlines`)
- Lijst van taken met deadlines
- Gesorteerd op urgentie
- Data: eigen API call

### Widget: Statistieken (`stats`)
- Aantal taken afgerond
- Totaal uren gewerkt
- Planning gehaald percentage
- Data: eigen API calls

### Widget: Focus (`focus`)
- Huidige focus-taak
- Voortgang
- Data: eigen API call

### Widget: Quick Actions (`quick-actions`)
- Snelle acties: + Taak, + Uren, + Notitie
- Navigatie shortcuts
- Data: geen (interactie-only)

### Widget: Prioriteiten (`priorities`)
- Taken gegroepeerd op prioriteit
- HIGH / MEDIUM / LOW counts
- Data: eigen API call

### Widget: Komende taken (`coming-tasks`)
- Volgende 5-10 taken
- Met deadlines en prioriteit
- Data: eigen API call

---

## Widget Data Pattern

Elke widget gebruikt een consistente data-fetching pattern:

```typescript
// hooks/useWidgetData.ts
export function useWidgetData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[]
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  // Eigen loading/error state
  // Auto-refetch op mount
  // Optionele polling interval
  // Abort controller voor cleanup
}
```

---

## Bestandsstructuur

```
src/components/workspace/
├── Workspace.tsx              # Hoofdcomponent
├── WorkspaceContext.tsx        # State management context
├── WorkspaceHeader.tsx         # Header met controls
├── WidgetGrid.tsx              # Grid layout wrapper
├── WidgetContainer.tsx         # Widget wrapper (header + resize)
├── WidgetLibrary.tsx           # "+ Widget" modal
├── WidgetMenu.tsx              # ⋯ context menu per widget
├── WidgetSettingsModal.tsx     # Instellingen modal
├── registry.ts                 # Widget definitie registry
├── persistence.ts              # localStorage opslag
├── types.ts                    # TypeScript types
├── templates.ts                # Dashboard templates (Minimal, Stage, etc.)
└── hooks/
    ├── useWorkspaceState.ts    # Workspace state hook
    └── useWidgetData.ts        # Universele data-fetching hook

src/components/workspace/widgets/
├── TodayWidget.tsx
├── TodoWidget.tsx
├── WeekOverviewWidget.tsx
├── HoursWidget.tsx
├── HoursPerProjectWidget.tsx
├── AgendaWidget.tsx
├── NotesWidget.tsx
├── DeadlinesWidget.tsx
├── StatsWidget.tsx
├── FocusWidget.tsx
├── QuickActionsWidget.tsx
├── PrioritiesWidget.tsx
└── ComingTasksWidget.tsx
```

---

## Implementatie Volgorde

### Fase 1: Engine (dag 1-2)

| # | Taak | Bestanden |
|---|---|---|
| 1 | `npm install react-grid-layout` + types | `package.json` |
| 2 | Type definities | `workspace/types.ts` |
| 3 | Widget Registry (leeg) | `workspace/registry.ts` |
| 4 | Workspace Context + persistence | `WorkspaceContext.tsx`, `persistence.ts` |
| 5 | Widget Grid component | `WidgetGrid.tsx` |
| 6 | Widget Container component | `WidgetContainer.tsx` |
| 7 | Widget Library modal | `WidgetLibrary.tsx` |
| 8 | Workspace Header | `WorkspaceHeader.tsx` |
| 9 | Workspace hoofdcomponent | `Workspace.tsx` |
| 10 | Integratie in WeekplannerApp | `WeekplannerApp.tsx` |
| 11 | Test: widgets toevoegen/verplaatsen/resizen | Handmatig |

### Fase 2: Widgets (dag 3-5)

| # | Widget | Complexiteit |
|---|---|---|
| 1 | TodayWidget | Laag |
| 2 | TodoWidget | Laag |
| 3 | NotesWidget | Laag |
| 4 | HoursWidget | Medium |
| 5 | WeekOverviewWidget | Medium |
| 6 | AgendaWidget | Medium |
| 7 | DeadlinesWidget | Laag |
| 8 | StatsWidget | Medium |
| 9 | FocusWidget | Laag |
| 10 | QuickActionsWidget | Laag |
| 11 | PrioritiesWidget | Laag |
| 12 | ComingTasksWidget | Laag |
| 13 | HoursPerProjectWidget | Medium |

---

## Key Design Rules

1. **Widgets zijn onafhankelijk** — elke widget haalt eigen data op, kent geen andere widgets
2. **Layout is data** — opgeslagen als JSON, niet als component code
3. **Edit mode is tijdelijk** — normaal: clean UI, edit: grid + handles + controls
4. **Minimum sizes** — elke widget heeft min/max afmetingen om onbruikbare states te voorkomen
5. **Debounced persistance** — niet bij iedere pixelbeweging opslaan
6. **Responsive** — 12 cols desktop, 8 cols tablet, 1 col mobiel
7. **Widget instances** — dezelfde widget-type kan meerdere keren voorkomen met verschillende config
8. **Registry pattern** — nieuwe widget = 1 bestand + registratie in registry.ts

---

## Risico's & Mitigaties

| Risico | Mitigatie |
|---|---|
| react-grid-layout + React 19 compat | Test build direct na install. Fallback: fork of patches |
| Performance bij veel widgets | Lazy loading per widget, virtualisatie niet nodig bij <20 widgets |
| Widget data fetching waterfall | Parallelle fetches, loading skeletons |
| localStorage limiet (~5MB) | Layout data is klein (<10KB zelfs met 50 widgets) |
| Monolitische WeekplannerApp.tsx | Workspace is volledig losstaand component, geen paginagrootte toename |

---

##wap

Dit plan is geoptimaliseerd voor jouw specifieke project:

- **Past bij je bestaande architectuur** — geen brekende wijzigingen, tab-systeem blijft
- **Gebruiksvriendelijk** — widgets hebben eigen data, geen complexe prop-drilling
- **Uitbreidbaar** — registry pattern maakt toekomstige widgets trivial
- **Onderhoudbaar** — elke widget is <300 regels, gescheiden van de grid engine
- **Performance** — debounced saves, geen onnodige re-renders
- **Responsive** — react-grid-layout handles dit automatisch
