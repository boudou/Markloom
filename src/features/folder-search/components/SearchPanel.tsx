import { useEffect, useRef, useState } from 'react';
import { CaseSensitive, Regex, Search, WholeWord } from 'lucide-react';
import { IconButton, Tooltip } from '@/components/ui';
import { relativePath } from '@/components/layout/quickOpen';
import { useFileTreeStore } from '@/features/file-tree/stores/fileTreeStore';
import { buildSearchRegExp } from '@/features/find-replace/engine';
import { selectTabContent, useTabsStore } from '@/features/tabs';
import { openPath } from '@/lib/documentActions';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { errorMessage } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { flushEditorEdits, useUiStore } from '@/stores/uiStore';
import { searchFolder, type FolderSearchResult, type LineMatch } from '../api/searchFolder';
import { useFolderSearchStore } from '../stores/folderSearchStore';

// A finished run, keyed by rootId (never rootPath: two folders can share a name)
type RunOutcome = { rootId: number } & ({ result: FolderSearchResult } | { message: string });

/** Every open document with a path, as its editor has it now (unsaved edits included) */
function openDocumentTexts(): Map<string, string> {
  // Rich text holds its last edit until flushed
  flushEditorEdits();
  const state = useTabsStore.getState();

  return new Map(state.tabs.flatMap((tab) => (tab.path ? [[tab.path, selectTabContent(state, tab.id)] as const] : [])));
}

/** Opens the file (or switches to its tab) and reveals the line in whichever editor shows it */
async function openResult(path: string, line: number): Promise<void> {
  const tabs = useTabsStore.getState();
  let tab = tabs.tabs.find((t) => t.path === path);

  // An open tab is shown as it is: re-reading the disk would fail for a file deleted there
  if (tab) tabs.setActiveTab(tab.id);
  else {
    if (!(await openPath(path))) return;

    tab = useTabsStore.getState().tabs.find((t) => t.path === path);
  }

  if (!tab) return;

  useUiStore.getState().navigateToLine(tab.id, line);
}

/** The line's text with its matches marked; React text children only, as the text comes from the user's files */
function HighlightedLine({ match }: { match: LineMatch }) {
  const parts: React.ReactNode[] = [];
  let at = 0;

  for (const range of match.ranges) {
    if (range.from > at) parts.push(match.text.slice(at, range.from));
    parts.push(
      <mark key={range.from} className="bg-accent-muted text-accent-hover rounded-xs">
        {match.text.slice(range.from, range.to)}
      </mark>
    );
    at = range.to;
  }

  if (at < match.text.length) parts.push(match.text.slice(at));

  return <>{parts}</>;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function statusText(outcome: RunOutcome | null, searching: boolean): string[] {
  if (searching || !outcome) return ['Searching…'];

  if ('message' in outcome) return [outcome.message];

  const { files, lineCount, lineLimitReached, listingTruncated, unreadable } = outcome.result;
  const lines = [lineCount ? `${plural(lineCount, 'result')} in ${plural(files.length, 'file')}` : 'No results'];

  if (lineLimitReached) lines.push(`Showing the first ${lineCount} matching lines`);
  else if (listingTruncated) lines.push('The folder has more files than were searched');

  if (unreadable) lines.push(`${plural(unreadable, 'file')} couldn't be read`);

  return lines;
}

/** The sidebar's Search view: every Markdown and Mermaid file in the open folder, by file and line */
export default function SearchPanel() {
  const rootPath = useAppStore((s) => s.rootPath);
  const rootId = useFileTreeStore((s) => s.rootId);
  const query = useFolderSearchStore((s) => s.query);
  const caseSensitive = useFolderSearchStore((s) => s.caseSensitive);
  const wholeWord = useFolderSearchStore((s) => s.wholeWord);
  const regex = useFolderSearchStore((s) => s.regex);
  const focusRequest = useFolderSearchStore((s) => s.focusRequest);
  const setQuery = useFolderSearchStore((s) => s.setQuery);
  const toggleCaseSensitive = useFolderSearchStore((s) => s.toggleCaseSensitive);
  const toggleWholeWord = useFolderSearchStore((s) => s.toggleWholeWord);
  const toggleRegex = useFolderSearchStore((s) => s.toggleRegex);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebouncedValue(query, 250);
  // Enter searches at once with the text as typed (also how to refresh after files change)
  const [rerun, setRerun] = useState({ query: '', count: 0 });
  const searchedQuery = rerun.count > 0 && rerun.query === query ? query : debouncedQuery;
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [searching, setSearching] = useState(false);
  // The result row that holds the list's one Tab stop
  const [tabStop, setTabStop] = useState(0);

  const pattern = buildSearchRegExp({ query: searchedQuery, replacement: '', caseSensitive, wholeWord, regex });

  // Focus (and select) the query on opening and on every Ctrl+Shift+F. A frame later, because the
  // sidebar drops `inert` in its own effect, which runs after this one, and an inert input can't take focus.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => cancelAnimationFrame(frame);
  }, [focusRequest]);

  useEffect(() => {
    if (!rootPath || !searchedQuery) return;

    const regExp = buildSearchRegExp({ query: searchedQuery, replacement: '', caseSensitive, wholeWord, regex });

    if (!regExp) return;

    const controller = new AbortController();
    const superseded = () => controller.signal.aborted || useFileTreeStore.getState().rootId !== rootId;

    setSearching(true);
    searchFolder(rootPath, regExp, openDocumentTexts(), controller.signal).then(
      (result) => {
        if (superseded()) return;

        setOutcome({ rootId, result });
        setSearching(false);
        setTabStop(0);
      },
      (error) => {
        if (superseded()) return;

        setOutcome({ rootId, message: errorMessage(error) });
        setSearching(false);
      }
    );

    return () => {
      controller.abort();
      setSearching(false);
    };
  }, [rootPath, rootId, searchedQuery, caseSensitive, wholeWord, regex, rerun.count]);

  const resultButtons = () => Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button[data-result]') ?? []);

  const focusResult = (index: number) => {
    const buttons = resultButtons();
    const target = buttons[Math.max(0, Math.min(index, buttons.length - 1))];

    target?.focus();
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setRerun((last) => ({ query, count: last.count + 1 }));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusResult(0);
    }
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const buttons = resultButtons();
    const index = buttons.findIndex((button) => button === document.activeElement);

    if (index < 0) return;

    const next =
      e.key === 'ArrowDown' ? index + 1
      : e.key === 'ArrowUp' ? index - 1
      : e.key === 'Home' ? 0
      : e.key === 'End' ? buttons.length - 1
      : null;

    if (next === null) return;

    e.preventDefault();
    focusResult(next);
  };

  const shown = outcome && outcome.rootId === rootId ? outcome : null;
  const result = shown && 'result' in shown ? shown.result : null;
  const status = !searchedQuery ? [] : !pattern ? ['Invalid regular expression'] : statusText(shown, searching);
  let rowIndex = 0;

  return (
    <div role="search" aria-label="Search in folder" className="h-full flex flex-col min-h-0">
      <div className="p-2 flex flex-col gap-1.5 border-b border-rule shrink-0">
        <div className="flex items-center gap-0.5 bg-canvas rounded-md border border-rule focus-within:border-accent-primary transition-colors">
          <Search className="w-4 h-4 text-text-muted ml-2 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            id="folder-search-query"
            name="folder-search-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search in folder"
            aria-label="Search in folder"
            autoComplete="off"
            spellCheck={false}
            className="flex-1 min-w-0 bg-transparent py-1.5 px-2 text-sm text-text-primary placeholder:text-text-muted outline-hidden"
          />
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
            <IconButton variant="ghost" size="sm" pressed={regex} onClick={toggleRegex} className="mr-0.5">
              <Regex className="w-4 h-4" />
            </IconButton>
          </Tooltip>
        </div>
        <div aria-live="polite" className="px-1 text-xs text-text-muted leading-snug min-h-4">
          {status.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      {result && pattern && result.files.length > 0 && (
        <div ref={listRef} onKeyDown={onListKey} role="region" aria-label="Search results" className="flex-1 min-h-0 overflow-y-auto py-1">
          {result.files.map((file) => (
            <section key={file.path} className="pb-1">
              <h3 className="flex items-baseline gap-2 px-3 pt-1.5 pb-0.5 text-xs font-medium text-text-primary" title={file.path}>
                <span className="truncate">{rootPath ? relativePath(file.path, rootPath) : file.path}</span>
                <span className="ml-auto shrink-0 text-text-muted tabular-nums">{file.lines.length}</span>
              </h3>
              <ul>
                {file.lines.map((match) => {
                  const index = rowIndex++;

                  return (
                    <li key={match.line}>
                      <button
                        type="button"
                        data-result
                        tabIndex={index === tabStop ? 0 : -1}
                        onFocus={() => setTabStop(index)}
                        onClick={() => void openResult(file.path, match.line)}
                        className="w-full flex items-baseline gap-2 pl-5 pr-3 py-0.5 text-left text-[13px] leading-snug outline-hidden hover:bg-wash focus-visible:bg-wash transition-colors"
                      >
                        <span className="shrink-0 min-w-[2ch] text-right text-xs text-text-muted tabular-nums">{match.line}</span>
                        <span className="truncate text-text-secondary">
                          <HighlightedLine match={match} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
