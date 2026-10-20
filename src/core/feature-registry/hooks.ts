import { useState, useEffect, useCallback } from 'react';
import { featureRegistry } from './registry';
import type { FeatureDefinition, FeatureState, CommandDefinition, ToolbarIntegration, StatusBarIntegration, PanelIntegration } from './types';

// Hook to get all features
export function useFeatures(): FeatureDefinition[] {
  const getSnapshot = useCallback(() => featureRegistry.getAllFeatures(), []);
  const [features, setFeatures] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setFeatures(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return features;
}

// Hook to get a specific feature
export function useFeature(featureId: string): FeatureDefinition | undefined {
  const getSnapshot = useCallback(() => featureRegistry.getFeature(featureId), [featureId]);
  const [feature, setFeature] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe((event) => {
      if (event.featureId === featureId) {
        setFeature(getSnapshot());
      }
    });
    return unsubscribe;
  }, [featureId, getSnapshot]);

  return feature;
}

// Hook to check if a feature is enabled
export function useFeatureEnabled(featureId: string): boolean {
  const getSnapshot = useCallback(() => featureRegistry.isEnabled(featureId), [featureId]);
  const [enabled, setEnabled] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe((event) => {
      if (event.featureId === featureId && (event.type === 'enabled' || event.type === 'disabled')) {
        setEnabled(getSnapshot());
      }
    });
    return unsubscribe;
  }, [featureId, getSnapshot]);

  return enabled;
}

// Hook to get feature state
export function useFeatureState(featureId: string): FeatureState | undefined {
  const getSnapshot = useCallback(() => featureRegistry.getFeatureState(featureId), [featureId]);
  const [state, setState] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe((event) => {
      if (event.featureId === featureId) {
        setState(getSnapshot());
      }
    });
    return unsubscribe;
  }, [featureId, getSnapshot]);

  return state;
}

// Hook to get a feature setting
export function useFeatureSetting<T>(featureId: string, key: string): T | undefined {
  const getSnapshot = useCallback(
    () => featureRegistry.getFeatureSetting<T>(featureId, key),
    [featureId, key]
  );
  const [value, setValue] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe((event) => {
      if (event.featureId === featureId) {
        setValue(getSnapshot());
      }
    });
    return unsubscribe;
  }, [featureId, key, getSnapshot]);

  return value;
}

// Hook to get enabled features
export function useEnabledFeatures(): FeatureDefinition[] {
  const getSnapshot = useCallback(() => featureRegistry.getEnabledFeatures(), []);
  const [features, setFeatures] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setFeatures(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return features;
}

// Hook to get toolbar items from enabled features
export function useToolbarItems(): Array<ToolbarIntegration & { featureId: string }> {
  const getSnapshot = useCallback(() => featureRegistry.getToolbarItems(), []);
  const [items, setItems] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setItems(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return items;
}

// Hook to get status bar widgets from enabled features
export function useStatusBarWidgets(): Array<StatusBarIntegration & { featureId: string }> {
  const getSnapshot = useCallback(() => featureRegistry.getStatusBarWidgets(), []);
  const [widgets, setWidgets] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setWidgets(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return widgets;
}

// Hook to get panels from enabled features
export function usePanels(): Array<PanelIntegration & { featureId: string }> {
  const getSnapshot = useCallback(() => featureRegistry.getPanels(), []);
  const [panels, setPanels] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setPanels(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return panels;
}

// Hook to get all commands from enabled features
export function useCommands(): Array<CommandDefinition & { featureId: string }> {
  const getSnapshot = useCallback(() => featureRegistry.getCommands(), []);
  const [commands, setCommands] = useState(getSnapshot);

  useEffect(() => {
    const unsubscribe = featureRegistry.subscribe(() => {
      setCommands(getSnapshot());
    });
    return unsubscribe;
  }, [getSnapshot]);

  return commands;
}

// Hook for feature toggle actions
export function useFeatureToggle(featureId: string): {
  enabled: boolean;
  toggle: () => Promise<void>;
  enable: () => Promise<void>;
  disable: () => void;
} {
  const enabled = useFeatureEnabled(featureId);

  const toggle = useCallback(async () => {
    if (enabled) {
      featureRegistry.disable(featureId);
    } else {
      await featureRegistry.enable(featureId);
    }
  }, [featureId, enabled]);

  const enable = useCallback(async () => {
    await featureRegistry.enable(featureId);
  }, [featureId]);

  const disable = useCallback(() => {
    featureRegistry.disable(featureId);
  }, [featureId]);

  return { enabled, toggle, enable, disable };
}
