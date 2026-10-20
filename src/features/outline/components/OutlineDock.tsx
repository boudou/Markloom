import { useEffect, useMemo, useRef, useState } from 'react';
import { getMarkdownParser } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { useTabsStore } from '@/features/tabs';
import { useAppStore } from '@/stores/appStore';

interface Heading {
  level: number;
  text: string;
  /** 1-based source line */
  line: number;
}

// Same parser as the preview, so headings line up one-to-one with the rendered ones
function parseHeadings(markdown: string): Heading[] {
  const tokens = getMarkdownParser().parse(markdown, {});
  const headings: Heading[] = [];
  tokens.forEach((token, i) => {
    if (token.type !== 'heading_open' || !token.map) return;
    const inline = tokens[i + 1];
    const text = (inline.children ?? [])
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join('')
      .trim();
    headings.push({ level: Number(token.tag.slice(1)), text: text || 'Untitled section', line: token.map[0] + 1 });
  });
  return headings;
}

/** The scrolling element that shows the rendered document (preview or rich-text editor). */
function documentSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-doc-surface]');
}

/** Docked table of contents that follows the reader's position. */
/** The document's headings, following the reader's position (shown in the sidebar) */
export function OutlineDock() {
  const content = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.content ?? '');
  const activeTabId = useTabsStore((s) => s.activeTabId);
  // Switching modes swaps the scrolling surface; re-attach to the new one
  const editorMode = useAppStore((s) => s.editorMode);
  // Re-parse shortly after typing pauses (a deferred value can stall behind the lazy editor's Suspense)
  const [settled, setSettled] = useState(content);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(content), 150);
    return () => window.clearTimeout(timer);
  }, [content]);
  const headings = useMemo(() => parseHeadings(settled), [settled]);
  const [current, setCurrent] = useState(0);
  // After a click, the smooth scroll passes other headings; don't let them steal the highlight
  const holdUntil = useRef(0);

  // Highlight the section whose heading was scrolled past last
  useEffect(() => {
    let surface: HTMLElement | null = null;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!surface || Date.now() < holdUntil.current) return;
        const top = surface.getBoundingClientRect().top + 96;
        const rendered = Array.from(surface.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
        let index = 0;
        rendered.forEach((el, i) => {
          if (el.getBoundingClientRect().top <= top) index = i;
        });
        // At the very end the last sections can't reach the top; the reader is in the last one
        const atBottom = surface.scrollTop + surface.clientHeight >= surface.scrollHeight - 4;
        setCurrent(atBottom && rendered.length ? rendered.length - 1 : index);
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
  }, [activeTabId, headings.length, editorMode]);

  const go = (_heading: Heading, index: number) => {
    setCurrent(index);
    holdUntil.current = Date.now() + 900;
    // Scroll the rendered document only; in split view, scroll sync brings the source along.
    // (Moving both panes at once made them fight and land a section off.)
    documentSurface()
      ?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
      [index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                    onClick={() => go(heading, index)}
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
