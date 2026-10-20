import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { parseTableOfContents, type TocItem } from '../utils';

export function useToc(): TocItem[] {
  const content = useAppStore((state) => state.content);

  const items = useMemo(() => {
    return parseTableOfContents(content);
  }, [content]);

  return items;
}
