import { useCallback, useState, type FocusEvent } from 'react';

// After interior.dev: one highlight slides to the active item instead of each item lighting
// up. Radix moves focus to the highlighted item (pointer and keyboard alike), so following
// focus is enough; when the pointer leaves the items Radix focuses the menu itself.
// The container must be the items' offset parent (position: relative).

const ITEM = '[role^="menuitem"], [role="option"]';

interface Box {
  top: number;
  height: number;
  shown: boolean;
  /** First placement after being hidden: appear in place rather than slide from the last spot */
  jump: boolean;
}

export function useMenuHighlight() {
  const [box, setBox] = useState<Box | null>(null);

  const onFocusCapture = useCallback((event: FocusEvent<HTMLElement>) => {
    const container = event.currentTarget;
    const item = (event.target as HTMLElement).closest<HTMLElement>(ITEM);
    // Focus inside a submenu bubbles here too (React portals); the submenu has its own highlight
    const ours = item && container.contains(item) && item.offsetParent === container;
    setBox((previous) =>
      ours
        ? { top: item.offsetTop, height: item.offsetHeight, shown: true, jump: !previous?.shown }
        : previous && { ...previous, shown: false, jump: true }
    );
  }, []);

  const highlight = (
    <span
      aria-hidden
      className="ml-menu-highlight"
      data-visible={box?.shown ? '' : undefined}
      data-jump={box?.jump ? '' : undefined}
      style={box ? { transform: `translateY(${box.top}px)`, height: box.height } : undefined}
    />
  );

  return { onFocusCapture, highlight };
}
