import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Input, Button } from '@/components/ui';
import { parseMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { useTabsStore } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';
import { builtInTemplates, searchTemplates, processTemplate, type Template } from '../utils';

interface TemplatesBodyProps {
  onClose: () => void;
}

const CATEGORY_LABEL: Record<Template['category'], string> = {
  general: 'General',
  development: 'Development',
  documentation: 'Documentation',
  personal: 'Personal',
};

/**
 * One searchable list beside a rendered preview; arrow keys move, Enter uses. Mounts fresh on
 * every open, so the search and selection start empty.
 */
export default function TemplatesBody({ onClose }: TemplatesBodyProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const createTab = useTabsStore((s) => s.createTab);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const templates = useMemo(() => (query.trim() ? searchTemplates(query) : builtInTemplates), [query]);
  const selected = templates[Math.min(activeIndex, templates.length - 1)] ?? null;

  // On the first open this chunk arrives after the dialog has auto-focused its Close button, so
  // move focus to the search box. When the chunk is cached the Modal's data-autofocus handling
  // already did it (and remembered where focus came from); autoFocus would skip that step.
  useEffect(() => {
    const input = inputRef.current;
    const dialog = input?.closest('[role="dialog"]');

    if (input && dialog?.contains(document.activeElement) && document.activeElement !== input) input.focus();
  }, []);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Show templates as they'll read, not as raw Markdown. Not memoized: a template is short, and
  // each render (opening included) fills in today's date.
  const previewHtml = selected ? parseMarkdown(processTemplate(selected.content)) : '';

  const applyTemplate = (template: Template | null) => {
    if (!template) return;
    createTab(null, processTemplate(template.content), template.name);
    // The new tab's editor takes the focus once it mounts, so typing goes into the template
    const { activeTabId } = useTabsStore.getState();

    if (activeTabId) useUiStore.getState().requestEditorFocus(activeTabId);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActiveIndex((i) => Math.min(i + 1, templates.length - 1));
    else if (e.key === 'ArrowUp') setActiveIndex((i) => Math.max(i - 1, 0));
    else if (e.key === 'Enter') applyTemplate(selected);
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex gap-5 h-[60vh] min-h-[360px]">
      <div className="w-[38%] shrink-0 flex flex-col min-h-0">
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" aria-hidden />
          <Input
            ref={inputRef}
            data-autofocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search templates"
            aria-label="Search templates"
            role="combobox"
            aria-expanded="true"
            aria-controls="template-list"
            aria-activedescendant={selected ? `template-${selected.id}` : undefined}
            className="pl-9"
          />
        </div>
        <ul id="template-list" ref={listRef} role="listbox" aria-label="Templates" className="flex-1 overflow-y-auto -mx-1 px-1">
          {templates.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-text-muted">No templates match “{query}”</li>
          )}
          {templates.map((template, index) => (
            <li
              key={template.id}
              id={`template-${template.id}`}
              role="option"
              aria-selected={index === activeIndex}
              data-index={index}
              onClick={() => setActiveIndex(index)}
              onDoubleClick={() => applyTemplate(template)}
              className={cn(
                'px-3 py-2 rounded-md cursor-default',
                index === activeIndex ? 'bg-accent-muted' : 'hover:bg-wash'
              )}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-text-primary">{template.name}</span>
                <span className="text-[11px] text-text-muted shrink-0">{CATEGORY_LABEL[template.category]}</span>
              </div>
              <p className="text-xs text-text-secondary leading-snug mt-0.5">{template.description}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {selected ? (
          <>
            <div
              className="flex-1 overflow-y-auto rounded-lg border border-rule bg-canvas px-6 py-5 prose-markloom font-editor text-sm [&_h1]:text-xl [&_h2]:text-lg"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-text-muted">Opens in a new tab. Enter to use, or double-click.</p>
              <Button onClick={() => applyTemplate(selected)}>Use “{selected.name}”</Button>
            </div>
          </>
        ) : (
          <div className="flex-1 rounded-lg border border-dashed border-rule" aria-hidden />
        )}
      </div>
    </div>
  );
}
