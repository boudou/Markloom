import { useMemo } from 'react';
import { useActiveContent } from '@/features/tabs';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { countText, type TextCount } from '../utils';

export function useWordCount(): TextCount {
  // One pass, but over the whole document; do it once typing pauses
  const content = useDebouncedValue(useActiveContent(), 150);

  return useMemo(() => countText(content), [content]);
}
