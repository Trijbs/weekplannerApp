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

export type WidgetCategory = "planning" | "uren" | "taken" | "persoonlijk";

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

export interface WidgetProps {
  instance: WidgetInstance;
  isEditMode: boolean;
  onUpdateConfig: (config: WidgetConfig) => void;
}

export interface WidgetDefinition {
  type: WidgetType;
  name: string;
  description: string;
  icon: string;
  category: WidgetCategory;
  component: ComponentType<WidgetProps>;
  defaultConfig: WidgetConfig;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
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
