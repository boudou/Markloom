import { useMemo } from 'react';
import { useActiveContent } from '@/features/tabs';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { calculateTextStats, type TextStats } from '../utils';

export function useWordCount(): TextStats {
  // Counting walks the whole document several times; do it once typing pauses
  const content = useDebouncedValue(useActiveContent(), 150);

  return useMemo(() => calculateTextStats(content), [content]);
}
