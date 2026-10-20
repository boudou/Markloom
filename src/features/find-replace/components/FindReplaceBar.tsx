import { useEffect, useRef, useSyncExternalStore } from 'react';
import { X, ChevronDown, ChevronUp, Search, Replace, CaseSensitive, Regex, WholeWord } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { useFindReplaceStore } from '../stores';
import type { SearchEngine, SearchResult } from '../engine';

interface FindReplaceBarProps {
  /** The active editor's search engine; the bar works the same in both modes */
  engine: SearchEngine | null;
}

const inputBox =
  'flex-1 min-w-0 flex items-center gap-1 bg-canvas rounded-md border border-rule focus-within:border-accent-primary transition-colors';
const inputField = 'flex-1 min-w-0 bg-transparent py-1.5 px-2 text-sm text-text-primary placeholder:text-text-muted outline-none';
// Stand-ins for useSyncExternalStore while no editor is mounted
const NO_RESULT: SearchResult = { count: 0, current: -1, invalid: false };
const subscribeNothing = () => () => {};
const noResult = () => NO_RESULT;

const textButton =
  'h-7 px-2.5 rounded-md text-xs font-medium text-text-secondary hover:bg-wash hover:text-text-primary disabled:opacity-40 disabled:pointer-events-none outline-none focus-visible:ring-2 focus-visible:ring-accent-primary';

export function FindReplaceBar({ engine }: FindReplaceBarProps) {
  const {
    isOpen,
    showReplace,
    searchQuery,
    replaceQuery,
    caseSensitive,
    useRegex,
    wholeWord,
    close,
    toggleReplace,
    setSearchQuery,
    setReplaceQuery,
    toggleCaseSensitive,
    toggleRegex,
    toggleWholeWord,
  } = useFindReplaceStore();
  // The engine pushes recounts (after edits in the editor too), so the status stays live
  const result = useSyncExternalStore(engine?.subscribe ?? subscribeNothing, engine?.getResult ?? noResult);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus and select the query when the bar opens (only then, never while typing)
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  // Re-run the search when the query, options or editor change; the query survives mode switches
  useEffect(() => {
    if (!isOpen || !engine) return;
    engine.update({ query: searchQuery, replacement: replaceQuery, caseSensitive, wholeWord, regex: useRegex });
  }, [isOpen, engine, searchQuery, replaceQuery, caseSensitive, wholeWord, useRegex]);

  // Clear highlights when closing, and on the old editor when the editor is swapped
  useEffect(() => {
    if (!isOpen || !engine) return;
    return () => engine.clear();
  }, [isOpen, engine]);

  if (!isOpen) return null;

  const dismiss = () => {
    close();
    engine?.focusEditor();
  };

  const onFindKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) engine?.previous();
      else engine?.next();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
    }
  };

  const status = !searchQuery
    ? ''
    : result.invalid
      ? 'Invalid pattern'
      : result.count
        ? `${result.current + 1} of ${result.count}`
        : 'No matches';

  return (
    <div role="search" aria-label="Find in document" className="border-b border-rule bg-panel flex-shrink-0">
      <div className="p-2 flex flex-col gap-2 max-w-3xl">
        <div className="flex items-center gap-2">
          <div className={inputBox}>
            <Search className="w-4 h-4 text-text-muted ml-2 flex-shrink-0" aria-hidden />
            <input
              ref={searchInputRef}
              id="find-query"
              name="find-query"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onFindKey}
              placeholder="Find"
              aria-label="Find"
              autoComplete="off"
              spellCheck={false}
              className={inputField}
            />
            <span className="text-xs text-text-muted px-2 tabular-nums whitespace-nowrap" aria-live="polite">
              {status}
            </span>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Tooltip content="Match case">
              <IconButton variant="ghost" size="sm" pressed={caseSensitive} onClick={toggleCaseSensitive}>
                <CaseSensitive className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Whole word">
              <IconButton variant="ghost" size="sm" pressed={wholeWord} onClick={toggleWholeWord}>
                <WholeWord className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Regular expression">
              <IconButton variant="ghost" size="sm" pressed={useRegex} onClick={toggleRegex}>
                <Regex className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <div className="w-px h-4 bg-rule mx-1" aria-hidden />
            <Tooltip content="Previous match (Shift+Enter)">
              <IconButton variant="ghost" size="sm" onClick={() => engine?.previous()} disabled={!result.count}>
                <ChevronUp className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Next match (Enter)">
              <IconButton variant="ghost" size="sm" onClick={() => engine?.next()} disabled={!result.count}>
                <ChevronDown className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <Tooltip content={showReplace ? 'Hide replace' : 'Replace'}>
              <IconButton variant="ghost" size="sm" pressed={showReplace} onClick={toggleReplace}>
                <Replace className="w-4 h-4" />
              </IconButton>
            </Tooltip>
            <Tooltip content="Close (Esc)">
              <IconButton variant="ghost" size="sm" onClick={dismiss}>
                <X className="w-4 h-4" />
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {showReplace && (
          <div className="flex items-center gap-2">
            <div className={inputBox}>
              <Replace className="w-4 h-4 text-text-muted ml-2 flex-shrink-0" aria-hidden />
              <input
                id="find-replacement"
                name="find-replacement"
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    engine?.replace();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    dismiss();
                  }
                }}
                placeholder="Replace with"
                aria-label="Replace with"
                autoComplete="off"
                spellCheck={false}
                className={inputField}
              />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" className={textButton} disabled={!result.count} onClick={() => engine?.replace()}>
                Replace
              </button>
              <button
                type="button"
                className={textButton}
                disabled={!result.count}
                onClick={() => engine?.replaceAll()}
              >
                Replace all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
