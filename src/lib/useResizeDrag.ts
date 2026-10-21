import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

/** A handle's range and the value a double-click restores; each store that owns a size defines one */
export interface ResizeBounds {
  readonly min: number;
  readonly max: number;
  readonly defaultValue: number;
}

interface ResizeDragOptions {
  /** The persisted value; shown whenever no drag is in progress */
  stored: number;
  bounds: ResizeBounds;
  /** Arrow key step, and the larger one with Shift held */
  step: number;
  shiftStep: number;
  /** Measured once when the drag starts */
  anchorRef: RefObject<HTMLElement>;
  /** Pointer x to value, given the anchor's rect from the start of the drag */
  toValue: (clientX: number, anchor: DOMRect) => number;
  /** Saves a value: once per drag on release (not if the pointer never moved), and on each key or double-click */
  commit: (value: number) => void;
}

interface ResizeDrag {
  value: number;
  dragging: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  /** Arrow Left/Right (Shift for the larger step), Home and End */
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  /** Restores the default */
  onDoubleClick: () => void;
}

/**
 * Owns a resize handle's pointer, keyboard and double-click input. Dragging: the value follows
 * the pointer in local state and is saved once, on release, so persisted stores aren't
 * rewritten on every pointer move. Pointer capture keeps
 * the drag alive when the pointer races ahead of the handle (the editor, the desktop title bar
 * region or an iframe would otherwise swallow moves).
 */
export function useResizeDrag({ stored, bounds, step, shiftStep, anchorRef, toValue, commit }: ResizeDragOptions): ResizeDrag {
  const [local, setLocal] = useState<number | null>(null);
  const endRef = useRef<(() => void) | null>(null);

  const clamp = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));

  // Unmounting mid-drag (sidebar closed, mode switched) still saves and resets the cursor
  useEffect(() => () => endRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const anchor = anchorRef.current;

    // One drag at a time: a second finger or pen on a touch-none handle would start another
    if (event.button !== 0 || !anchor || endRef.current) return;

    event.preventDefault();
    const { pointerId } = event;
    event.currentTarget.setPointerCapture(pointerId);
    const rect = anchor.getBoundingClientRect();
    let latest: number | null = null;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    setLocal(stored);

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;

      const next = clamp(toValue(ev.clientX, rect));
      latest = next;
      setLocal(next);
    };

    const release = (ev: PointerEvent) => {
      if (ev.pointerId === pointerId) end();
    };

    // Window, not the handle: captured events bubble here and keep arriving if the handle unmounts
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      endRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Store first, so no frame shows the old stored value
      if (latest !== null) commit(latest);
      setLocal(null);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    endRef.current = end;
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    // A key mid-drag would be overwritten by the pointer's value on release
    if (endRef.current) return;

    const delta = event.shiftKey ? shiftStep : step;

    if (event.key === 'ArrowLeft') commit(clamp(stored - delta));
    else if (event.key === 'ArrowRight') commit(clamp(stored + delta));
    else if (event.key === 'Home') commit(bounds.min);
    else if (event.key === 'End') commit(bounds.max);
    // Tab and Escape keep their default and move focus on
    else return;

    event.preventDefault();
  };

  const onDoubleClick = () => commit(bounds.defaultValue);

  return { value: local ?? stored, dragging: local !== null, onPointerDown, onKeyDown, onDoubleClick };
}
