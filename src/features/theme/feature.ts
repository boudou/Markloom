import { Moon } from 'lucide-react';
import type { FeatureDefinition } from '@/core/feature-registry';

export const themeFeature: FeatureDefinition = {
  id: 'theme',
  name: 'Dark Theme',
  description: 'Dark theme for the application',
  version: '1.0.0',
  defaultEnabled: true,

  toolbar: {
    icon: Moon,
    tooltip: 'Dark Theme',
    position: 'end',
    onClick: () => {},
  },
};
