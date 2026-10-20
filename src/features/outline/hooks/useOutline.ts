import { useMemo } from 'react';
import { useAppStore } from '@/stores/appStore';
import { parseOutline, filterOutlineItems, type OutlineItemType } from '../utils';
import { useOutlineStore } from '../stores/outlineStore';

export function useOutline() {
  const content = useAppStore((state) => state.content);
  const { filterTypes } = useOutlineStore();

  const allItems = useMemo(() => {
    return parseOutline(content);
  }, [content]);

  const filteredItems = useMemo(() => {
    return filterOutlineItems(allItems, filterTypes);
  }, [allItems, filterTypes]);

  const counts = useMemo(() => {
    const result: Record<OutlineItemType, number> = {
      heading: 0,
      code: 0,
      image: 0,
      link: 0,
      table: 0,
    };

    for (const item of allItems) {
      result[item.type]++;
    }

    return result;
  }, [allItems]);

  return {
    allItems,
    filteredItems,
    counts,
    hasItems: allItems.length > 0,
  };
}
