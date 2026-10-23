import { useEffect, useMemo, useRef, useState } from 'react';
import { getMarkdownParser, headingText } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { selectActiveTab, useActiveContent, useTabsStore } from '@/features/tabs';
import { useAppStore, type EditorMode } from '@/stores/appStore';
import { useUiStore } from '@/stores/uiStore';
import { selectSmartTypography, useSettingsStore } from '@/stores/settingsStore';

interface Heading {
  level: number;
  text: string;
  /** 1-based source line */
  line: number;
}

// Same parser as the preview, so the labels match the rendered headings and their ids
function parseHeadings(markdown: string): Heading[] {
  const tokens = getMarkdownParser().parse(markdown, {});
  const headings: Heading[] = [];
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open' || !token.map) return;
    const text = headingText(tokens[i + 1]);
    headings.push({ level: Number(token.tag.slice(1)), text: text || 'Untitled section', line: token.map[0] + 1 });
  });

  return headings;
}

/** The scrolling element that shows the rendered document (preview or rich-text editor). */
function documentSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-doc-surface]');
}

/**
 * The rendered element of each outline heading, undefined while the surface hasn't caught up.
 * Raw HTML headings have no outline entry, so they are skipped in both modes: the preview
 * matches by source line, and rich text pairs its document headings by position, leaving out
 * headings rendered inside raw HTML.
 */
function renderedHeadings(surface: HTMLElement, mode: EditorMode, headings: Heading[]): Array<HTMLElement | undefined> {
  if (mode === 'split') {
    const byLine = new Map(
      Array.from(surface.querySelectorAll<HTMLElement>(':is(h1, h2, h3, h4, h5, h6)[data-line]'), (el) => [el.dataset.line, el])
    );

    return headings.map((heading) => byLine.get(String(heading.line)));
  }

  const shown = surface.querySelectorAll<HTMLElement>('.rt-document :is(h1, h2, h3, h4, h5, h6):not(.rt-html *)');

  return headings.map((_heading, index) => shown[index]);
}

/** The document's headings, following the reader's position (shown in the sidebar) */
export function OutlineDock() {
  const content = useActiveContent();
  // The editor remounts by loadId (another tab, or a document loaded into this one), so
  // its scrolling surface is a new element; re-attach to it
  const loadId = useTabsStore((s) => selectActiveTab(s)?.loadId);
  // Switching modes swaps the scrolling surface; re-attach to the new one
  const editorMode = useAppStore((s) => s.editorMode);
  // Focus mode unmounts the preview, and leaving it mounts a new one
  const focusMode = useAppStore((s) => s.focusMode);
  // Re-parse shortly after typing pauses (a deferred value can stall behind the lazy editor's Suspense)
  const [settled, setSettled] = useState(content);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(content), 150);

    return () => window.clearTimeout(timer);
  }, [content]);
  // Labels show the headings as the preview does, with or without smart typography
  const smartTypography = useSettingsStore(selectSmartTypography);
  const headings = useMemo(() => parseHeadings(settled), [settled, smartTypography]);
  // The scroll tracker reads the latest headings without re-attaching on every parse
  const headingsRef = useRef(headings);
  headingsRef.current = headings;
  const [current, setCurrent] = useState(0);
  // After a click, the smooth scroll passes other headings; don't let them steal the highlight
  const holdUntil = useRef(0);

  // Highlight the section whose heading was scrolled past last
  // (recomputed, too, when sections are added or removed)
  useEffect(() => {
    let surface: HTMLElement | null = null;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!surface || Date.now() < holdUntil.current) return;

        const top = surface.getBoundingClientRect().top + 96;
        const outline = headingsRef.current;
        let index = 0;
        // Headings whose element isn't rendered yet (the preview lags typing) are skipped
        renderedHeadings(surface, editorMode, outline).forEach((el, i) => {
          if (el && el.getBoundingClientRect().top <= top) index = i;
        });

        // At the very end the last sections can't reach the top; the reader is in the last one
        const atBottom = surface.scrollTop + surface.clientHeight >= surface.scrollHeight - 4;
        setCurrent(atBottom && outline.length ? outline.length - 1 : index);
      });
    };

    // The surface mounts after the editor; look for it until it's there
    const attach = () => {
      surface = documentSurface();

      if (!surface) return false;
      surface.addEventListener('scroll', update, { passive: true });
      update();

      return true;
    };

    const timer = attach() ? undefined : window.setInterval(() => attach() && window.clearInterval(timer), 300);

    return () => {
      window.clearInterval(timer);
      cancelAnimationFrame(frame);
      surface?.removeEventListener('scroll', update);
    };
  }, [loadId, headings.length, editorMode, focusMode]);

  const go = (index: number) => {
    setCurrent(index);
    holdUntil.current = Date.now() + 900;
    // Scroll the rendered document only; in split view, scroll sync brings the source along.
    // (Moving both panes at once made them fight and land a section off.) The source gets
    // the cursor on the heading's line, without scrolling or taking focus from this list.
    const surface = documentSurface();
    const target = surface ? renderedHeadings(surface, editorMode, headings)[index] : undefined;

    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Only Markdown mode reads line requests; elsewhere one would linger until the next switch
    const { activeTabId } = useTabsStore.getState();

    if (editorMode === 'split' && activeTabId) useUiStore.getState().placeCursorAtLine(activeTabId, headings[index].line);
  };

  const minLevel = Math.min(...headings.map((h) => h.level), 6);

  return (
    <div className="h-full flex flex-col min-h-0">

      {headings.length === 0 ? (
        <p className="px-4 py-4 text-sm text-text-muted leading-relaxed">
          Headings appear here as you add them. Start a line with <code className="font-mono text-text-secondary"># </code>
          to make one.
        </p>
      ) : (
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Sections">
          <ol>
            {headings.map((heading, index) => {
              const depth = heading.level - minLevel;
              const isCurrent = index === current;

              return (
                <li key={`${heading.line}-${index}`}>
                  <button
                    type="button"
                    onClick={() => go(index)}
                    aria-current={isCurrent ? 'location' : undefined}
                    style={{ paddingLeft: `${16 + depth * 12}px` }}
                    className={cn(
                      'relative w-full text-left pr-3 py-1 text-[13px] leading-snug outline-none truncate',
                      'focus-visible:bg-wash hover:bg-wash transition-colors',
                      depth === 0 ? 'font-medium' : '',
                      isCurrent ? 'text-accent-hover' : depth === 0 ? 'text-text-primary' : 'text-text-secondary'
                    )}
                    title={heading.text}
                  >
                    {isCurrent && <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-accent-primary" aria-hidden />}
                    {heading.text}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
    </div>
  );
}
