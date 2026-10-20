import type { ComponentType, LazyExoticComponent } from 'react';

// Feature metadata and configuration
export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  defaultEnabled: boolean;

  // Optional integration points
  toolbar?: ToolbarIntegration;
  statusBar?: StatusBarIntegration;
  panel?: PanelIntegration;
  commands?: CommandDefinition[];
  settings?: SettingDefinition[];

  // Lifecycle hooks
  init?: () => Promise<void> | void;
  cleanup?: () => void;
}

export interface ToolbarIntegration {
  icon: ComponentType<{ className?: string }>;
  tooltip: string;
  shortcut?: string;
  position?: 'start' | 'end' | number;
  onClick?: () => void;
  // For dropdown/popover content
  component?: LazyExoticComponent<ComponentType<ToolbarComponentProps>>;
  // For simple toggle behavior
  isActive?: () => boolean;
}

export interface ToolbarComponentProps {
  onClose: () => void;
}

export interface StatusBarIntegration {
  id: string;
  position: 'left' | 'right';
  priority?: number; // Higher = more to the edge
  component: ComponentType<StatusBarWidgetProps>;
}

export interface StatusBarWidgetProps {
  className?: string;
}

export interface PanelIntegration {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  position: 'left' | 'right';
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  component: LazyExoticComponent<ComponentType<PanelComponentProps>>;
}

export interface PanelComponentProps {
  width: number;
  onClose: () => void;
}

export interface CommandDefinition {
  id: string;
  name: string;
  description?: string;
  shortcut?: string;
  category?: string;
  action: () => void;
  when?: () => boolean; // Condition for when command is available
}

export interface SettingDefinition {
  key: string;
  type: 'boolean' | 'number' | 'string' | 'select';
  label: string;
  description?: string;
  defaultValue: unknown;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
}

// Feature state
export interface FeatureState {
  enabled: boolean;
  initialized: boolean;
  settings: Record<string, unknown>;
}

// Registry events
export type FeatureEvent =
  | { type: 'registered'; featureId: string }
  | { type: 'unregistered'; featureId: string }
  | { type: 'enabled'; featureId: string }
  | { type: 'disabled'; featureId: string }
  | { type: 'initialized'; featureId: string };

export type FeatureEventHandler = (event: FeatureEvent) => void;
