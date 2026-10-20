import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { calculateTextStats, type TextStats } from '../utils';

export function useWordCount(): TextStats {
  const content = useAppStore((state) => state.content);

  const stats = useMemo(() => {
    return calculateTextStats(content);
  }, [content]);

  return stats;
}
