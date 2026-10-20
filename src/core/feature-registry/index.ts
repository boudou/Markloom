// Feature Registry - Core plugin system for Markloom

export * from './types';
export { featureRegistry } from './registry';
export { FeatureProvider, useFeatureContext, registerFeatures } from './FeatureProvider';
export {
  useFeatures,
  useFeature,
  useFeatureEnabled,
  useFeatureState,
  useFeatureSetting,
  useEnabledFeatures,
  useToolbarItems,
  useStatusBarWidgets,
  usePanels,
  useCommands,
  useFeatureToggle,
} from './hooks';
