import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { featureRegistry } from './registry';
import type { FeatureDefinition, FeatureEvent } from './types';

interface FeatureContextValue {
  features: FeatureDefinition[];
  enabledFeatures: FeatureDefinition[];
  isReady: boolean;
}

const FeatureContext = createContext<FeatureContextValue>({
  features: [],
  enabledFeatures: [],
  isReady: false,
});

interface FeatureProviderProps {
  children: ReactNode;
  onReady?: () => void;
}

export function FeatureProvider({ children, onReady }: FeatureProviderProps) {
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const [enabledFeatures, setEnabledFeatures] = useState<FeatureDefinition[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initial load
    setFeatures(featureRegistry.getAllFeatures());
    setEnabledFeatures(featureRegistry.getEnabledFeatures());

    // Subscribe to changes
    const unsubscribe = featureRegistry.subscribe((_event: FeatureEvent) => {
      setFeatures(featureRegistry.getAllFeatures());
      setEnabledFeatures(featureRegistry.getEnabledFeatures());
    });

    // Mark as ready after initial setup
    setIsReady(true);
    onReady?.();

    return unsubscribe;
  }, [onReady]);

  return (
    <FeatureContext.Provider value={{ features, enabledFeatures, isReady }}>
      {children}
    </FeatureContext.Provider>
  );
}

export function useFeatureContext(): FeatureContextValue {
  return useContext(FeatureContext);
}

// Helper to register features at app startup
export function registerFeatures(featureDefinitions: FeatureDefinition[]): void {
  featureDefinitions.forEach((feature) => {
    featureRegistry.register(feature);
  });
}
