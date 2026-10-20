import type {
  FeatureDefinition,
  FeatureState,
  FeatureEvent,
  FeatureEventHandler,
  ToolbarIntegration,
  StatusBarIntegration,
  PanelIntegration,
  CommandDefinition,
} from './types';

class FeatureRegistry {
  private features = new Map<string, FeatureDefinition>();
  private featureStates = new Map<string, FeatureState>();
  private eventHandlers = new Set<FeatureEventHandler>();

  // Register a feature
  register(feature: FeatureDefinition): void {
    if (this.features.has(feature.id)) {
      console.warn(`Feature "${feature.id}" is already registered. Skipping.`);
      return;
    }

    this.features.set(feature.id, feature);
    this.featureStates.set(feature.id, {
      enabled: feature.defaultEnabled,
      initialized: false,
      settings: this.getDefaultSettings(feature),
    });

    this.emit({ type: 'registered', featureId: feature.id });

    // Auto-initialize if enabled by default
    if (feature.defaultEnabled) {
      this.initializeFeature(feature.id);
    }
  }

  // Unregister a feature
  unregister(featureId: string): void {
    const feature = this.features.get(featureId);
    if (!feature) return;

    // Cleanup before unregistering
    this.disable(featureId);

    this.features.delete(featureId);
    this.featureStates.delete(featureId);

    this.emit({ type: 'unregistered', featureId });
  }

  // Enable a feature
  async enable(featureId: string): Promise<void> {
    const state = this.featureStates.get(featureId);
    if (!state || state.enabled) return;

    state.enabled = true;
    await this.initializeFeature(featureId);

    this.emit({ type: 'enabled', featureId });
  }

  // Disable a feature
  disable(featureId: string): void {
    const feature = this.features.get(featureId);
    const state = this.featureStates.get(featureId);
    if (!feature || !state || !state.enabled) return;

    // Run cleanup
    if (feature.cleanup) {
      try {
        feature.cleanup();
      } catch (error) {
        console.error(`Error cleaning up feature "${featureId}":`, error);
      }
    }

    state.enabled = false;
    state.initialized = false;

    this.emit({ type: 'disabled', featureId });
  }

  // Initialize a feature
  private async initializeFeature(featureId: string): Promise<void> {
    const feature = this.features.get(featureId);
    const state = this.featureStates.get(featureId);
    if (!feature || !state || state.initialized) return;

    if (feature.init) {
      try {
        await feature.init();
      } catch (error) {
        console.error(`Error initializing feature "${featureId}":`, error);
        return;
      }
    }

    state.initialized = true;
    this.emit({ type: 'initialized', featureId });
  }

  // Check if feature is enabled
  isEnabled(featureId: string): boolean {
    return this.featureStates.get(featureId)?.enabled ?? false;
  }

  // Get a feature definition
  getFeature(featureId: string): FeatureDefinition | undefined {
    return this.features.get(featureId);
  }

  // Get feature state
  getFeatureState(featureId: string): FeatureState | undefined {
    return this.featureStates.get(featureId);
  }

  // Get all features
  getAllFeatures(): FeatureDefinition[] {
    return Array.from(this.features.values());
  }

  // Get enabled features
  getEnabledFeatures(): FeatureDefinition[] {
    return this.getAllFeatures().filter((f) => this.isEnabled(f.id));
  }

  // Get toolbar integrations from enabled features
  getToolbarItems(): Array<ToolbarIntegration & { featureId: string }> {
    return this.getEnabledFeatures()
      .filter((f) => f.toolbar)
      .map((f) => ({ ...f.toolbar!, featureId: f.id }))
      .sort((a, b) => {
        const posA = typeof a.position === 'number' ? a.position : a.position === 'start' ? -1000 : 1000;
        const posB = typeof b.position === 'number' ? b.position : b.position === 'start' ? -1000 : 1000;
        return posA - posB;
      });
  }

  // Get status bar widgets from enabled features
  getStatusBarWidgets(): Array<StatusBarIntegration & { featureId: string }> {
    return this.getEnabledFeatures()
      .filter((f) => f.statusBar)
      .map((f) => ({ ...f.statusBar!, featureId: f.id }))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  }

  // Get panels from enabled features
  getPanels(): Array<PanelIntegration & { featureId: string }> {
    return this.getEnabledFeatures()
      .filter((f) => f.panel)
      .map((f) => ({ ...f.panel!, featureId: f.id }));
  }

  // Get all commands from enabled features
  getCommands(): Array<CommandDefinition & { featureId: string }> {
    return this.getEnabledFeatures()
      .flatMap((f) => (f.commands ?? []).map((cmd) => ({ ...cmd, featureId: f.id })));
  }

  // Update feature setting
  setFeatureSetting(featureId: string, key: string, value: unknown): void {
    const state = this.featureStates.get(featureId);
    if (state) {
      state.settings[key] = value;
    }
  }

  // Get feature setting
  getFeatureSetting<T = unknown>(featureId: string, key: string): T | undefined {
    return this.featureStates.get(featureId)?.settings[key] as T | undefined;
  }

  // Event subscription
  subscribe(handler: FeatureEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  private emit(event: FeatureEvent): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in feature event handler:', error);
      }
    });
  }

  private getDefaultSettings(feature: FeatureDefinition): Record<string, unknown> {
    const settings: Record<string, unknown> = {};
    feature.settings?.forEach((setting) => {
      settings[setting.key] = setting.defaultValue;
    });
    return settings;
  }

  // Restore state from persisted settings
  restoreState(enabledFeatures: Record<string, boolean>, featureSettings: Record<string, Record<string, unknown>>): void {
    for (const [featureId, enabled] of Object.entries(enabledFeatures)) {
      const state = this.featureStates.get(featureId);
      if (state) {
        state.enabled = enabled;
        if (enabled && !state.initialized) {
          this.initializeFeature(featureId);
        }
      }
    }

    for (const [featureId, settings] of Object.entries(featureSettings)) {
      const state = this.featureStates.get(featureId);
      if (state) {
        Object.assign(state.settings, settings);
      }
    }
  }

  // Export state for persistence
  exportState(): { enabledFeatures: Record<string, boolean>; featureSettings: Record<string, Record<string, unknown>> } {
    const enabledFeatures: Record<string, boolean> = {};
    const featureSettings: Record<string, Record<string, unknown>> = {};

    this.featureStates.forEach((state, featureId) => {
      enabledFeatures[featureId] = state.enabled;
      featureSettings[featureId] = state.settings;
    });

    return { enabledFeatures, featureSettings };
  }
}

// Singleton instance
export const featureRegistry = new FeatureRegistry();
