import type { WidgetDefinition, WidgetType } from "./types";

import { TodayWidget } from "./widgets/TodayWidget";
import { TodoWidget } from "./widgets/TodoWidget";
import { NotesWidget } from "./widgets/NotesWidget";
import { HoursWidget } from "./widgets/HoursWidget";
import { HoursPerProjectWidget } from "./widgets/HoursPerProjectWidget";
import { WeekOverviewWidget } from "./widgets/WeekOverviewWidget";
import { AgendaWidget } from "./widgets/AgendaWidget";
import { DeadlinesWidget } from "./widgets/DeadlinesWidget";
import { StatsWidget } from "./widgets/StatsWidget";
import { FocusWidget } from "./widgets/FocusWidget";
import { QuickActionsWidget } from "./widgets/QuickActionsWidget";
import { PrioritiesWidget } from "./widgets/PrioritiesWidget";
import { ComingTasksWidget } from "./widgets/ComingTasksWidget";

const WIDGET_REGISTRY: Record<WidgetType, WidgetDefinition> = {
  today: {
    type: "today",
    name: "Vandaag",
    description: "Taken en overzicht van vandaag",
    icon: "📅",
    category: "planning",
    component: TodayWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  todo: {
    type: "todo",
    name: "Taken",
    description: "Open taken en to-do lijst",
    icon: "✅",
    category: "taken",
    component: TodoWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  notes: {
    type: "notes",
    name: "Notities",
    description: "Snel notities toevoegen",
    icon: "📝",
    category: "persoonlijk",
    component: NotesWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  hours: {
    type: "hours",
    name: "Uren",
    description: "Urenregistratie van vandaag",
    icon: "⏱️",
    category: "uren",
    component: HoursWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  "hours-per-project": {
    type: "hours-per-project",
    name: "Uren per project",
    description: "Urenoverzicht per project",
    icon: "📊",
    category: "uren",
    component: HoursPerProjectWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  "week-overview": {
    type: "week-overview",
    name: "Weekoverzicht",
    description: "Overzicht van de hele week",
    icon: "📆",
    category: "planning",
    component: WeekOverviewWidget,
    defaultConfig: {},
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    maxSize: { w: 12, h: 8 },
  },
  agenda: {
    type: "agenda",
    name: "Agenda",
    description: "Afspraken en agenda",
    icon: "🗓️",
    category: "planning",
    component: AgendaWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 4 },
    minSize: { w: 2, h: 3 },
    maxSize: { w: 8, h: 8 },
  },
  deadlines: {
    type: "deadlines",
    name: "Deadlines",
    description: "Komende deadlines",
    icon: "⏰",
    category: "taken",
    component: DeadlinesWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  stats: {
    type: "stats",
    name: "Statistieken",
    description: "Productiviteitsstatistieken",
    icon: "📈",
    category: "persoonlijk",
    component: StatsWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  focus: {
    type: "focus",
    name: "Focus",
    description: "Focus timer en sessies",
    icon: "🎯",
    category: "persoonlijk",
    component: FocusWidget,
    defaultConfig: {},
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 6, h: 6 },
  },
  "quick-actions": {
    type: "quick-actions",
    name: "Snelle acties",
    description: "Snel handelingen uitvoeren",
    icon: "⚡",
    category: "planning",
    component: QuickActionsWidget,
    defaultConfig: {},
    defaultSize: { w: 3, h: 2 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 6, h: 4 },
  },
  priorities: {
    type: "priorities",
    name: "Prioriteiten",
    description: "Taken op prioriteit",
    icon: "🔥",
    category: "taken",
    component: PrioritiesWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
  "coming-tasks": {
    type: "coming-tasks",
    name: "Komende taken",
    description: "Taken die eraan komen",
    icon: "📋",
    category: "taken",
    component: ComingTasksWidget,
    defaultConfig: {},
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 2, h: 2 },
    maxSize: { w: 8, h: 6 },
  },
};

export function getWidgetDefinition(type: WidgetType): WidgetDefinition | undefined {
  return WIDGET_REGISTRY[type];
}

export function getAllWidgetDefinitions(): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY);
}

export function getWidgetsByCategory(category: WidgetDefinition["category"]): WidgetDefinition[] {
  return Object.values(WIDGET_REGISTRY).filter((w) => w.category === category);
}
