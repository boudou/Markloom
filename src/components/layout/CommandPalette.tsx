import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd, rememberFocus, restoreFocus } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore, type RecentFile } from '@/stores/settingsStore';
import { mermaidTemplates } from '@/features/mermaid-toolbar';
import { documentName } from '@/features/file-tree/api/fileSystem';
import { MAX_FILES } from '@/features/file-tree/api/folderFiles';
import { openFolder, openPath } from '@/lib/documentActions';
import { dirname } from '@/lib/documentPath';
import { APP_COMMANDS, commandGroup, commandLabel, isOffered } from '@/lib/appCommands';
import { SHORTCUTS, type ShortcutId } from '@/lib/shortcuts';
import type { EditorCommands, MarkdownAction } from '@/features/editor/types';
import { rankFiles, relativePath, useFolderFiles } from './quickOpen';

/** The palette lists commands (Ctrl+Shift+P) or, as Quick open (Ctrl+P), the open folder's files */
type Mode = 'commands' | 'files';

interface Command {
  id: string;
  label: string;
  /** The header the row is listed under; beside the row instead while a query hides the headers */
  group?: string;
  /** Text beside the row in place of the group (a file's folder below the open folder, '' at the top) */
  detail?: string;
  shortcut?: ShortcutId;
  run: () => void;
}

/**
 * "Mind map" -> "Insert mind map", but acronyms and names keep their case:
 * "ER diagram" -> "Insert ER diagram", "Gantt chart" -> "Insert Gantt chart"
 */
function insertLabel(name: string): string {
  const lead = /^([A-Z]{2}|Gantt\b)/.test(name) ? name : name.charAt(0).toLowerCase() + name.slice(1);

  return `Insert ${lead}`;
}

/** Toggle labels and `when` read the stores directly, so the list reflects the moment it's built */
function buildCommands(editorCommands: EditorCommands | null, recentFiles: RecentFile[]): Command[] {
  const commands: Command[] = APP_COMMANDS.flatMap((c) =>
    c.id === 'palette' || !isOffered(c)
      ? []
      : [{ id: c.id, label: commandLabel(c), group: commandGroup(c), shortcut: c.shortcut, run: c.run }]
  );

  if (editorCommands) {
    const keyed = (id: MarkdownAction, shortcut: ShortcutId): Command => ({
      id: `format-${id}`,
      label: SHORTCUTS[shortcut].label,
      group: SHORTCUTS[shortcut].group,
      shortcut,
      run: () => editorCommands.run(id),
    });

    const plain = (id: MarkdownAction, label: string, group: string): Command => ({
      id: `format-${id}`,
      label,
      group,
      run: () => editorCommands.run(id),
    });

    commands.push(
      keyed('bold', 'bold'),
      keyed('italic', 'italic'),
      keyed('strikethrough', 'strikethrough'),
      keyed('code', 'inlineCode'),
      keyed('link', 'link'),
      plain('paragraph', 'Body text', 'Format'),
      keyed('h1', 'heading1'),
      keyed('h2', 'heading2'),
      keyed('h3', 'heading3'),
      keyed('ul', 'bulletList'),
      keyed('ol', 'orderedList'),
      keyed('checkbox', 'taskList'),
      keyed('quote', 'blockquote'),
      keyed('codeblock', 'codeBlock'),
      plain('table', 'Insert table', 'Insert'),
      plain('hr', 'Insert divider', 'Insert'),
      plain('image', 'Insert image…', 'Insert'),
      ...mermaidTemplates.map((template) => ({
        id: `diagram-${template.id}`,
        label: insertLabel(template.name),
        group: 'Insert',
        run: () => editorCommands.insert(template.template),
      }))
    );
  }

  for (const file of recentFiles.slice(0, 8)) {
    commands.push({
      id: `recent-${file.path}`,
      label: `Open recent: ${file.name}`,
      group: 'Recent',
      run: () => void openPath(file.path),
    });
  }

  return commands;
}

function useCommands(open: boolean): Command[] {
  const editorCommands = useUiStore((s) => s.editorCommands);
  const recentFiles = useSettingsStore((s) => s.recentFiles);
  const [commands, setCommands] = useState<Command[]>([]);

  // Built on opening (before paint), so toggle labels and `when` read the state of that moment.
  // Kept while closed: the list stays on screen during the closing animation.
  useLayoutEffect(() => {
    if (open) setCommands(buildCommands(editorCommands, recentFiles));
  }, [open, editorCommands, recentFiles]);

  return commands;
}

/** Every words of the query must appear; labels starting with the query rank first. */
function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);

  if (!words.length) return commands;

  return commands
    .filter((c) => {
      const haystack = `${c.label} ${c.shortcut ? SHORTCUTS[c.shortcut].label : ''} ${c.group ?? ''}`.toLowerCase();

      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(words[0])) - Number(a.label.toLowerCase().startsWith(words[0])));
}

// The palette measures the active row on every change; a long listing renders only its best rows
const MAX_FILE_ROWS = 100;

const OPEN_FOLDER_ROWS: Command[] = [
  { id: 'open-folder', label: SHORTCUTS.openFolder.label, shortcut: 'openFolder', run: () => void openFolder() },
];

/** What the palette shows in one mode */
interface PaletteView {
  title: string;
  inputLabel: string;
  placeholder: string;
  listLabel: string;
  /** Rows sit under their group's header while the query is empty */
  groupHeaders: boolean;
  results: Command[];
  /** Shown above the rows: why there are none, or what to do */
  notice: string | null;
  /** Shown below the rows */
  footer: string | null;
}

function useCommandRows(open: boolean, query: string): PaletteView {
  const commands = useCommands(open);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  return {
    title: 'Command palette',
    inputLabel: 'Command',
    placeholder: 'Type a command or file name',
    listLabel: 'Commands',
    groupHeaders: true,
    results,
    notice: results.length ? null : 'No matching commands',
    footer: null,
  };
}

/** Ranks only while `shown` and walks the folder only while `walk`, so the list stays put while the dialog fades */
function useFileRows(shown: boolean, walk: boolean, query: string): PaletteView {
  const files = useFolderFiles(walk);
  const rootPath = useAppStore((s) => s.rootPath);
  const recentFiles = useSettingsStore((s) => s.recentFiles);
  const paths = shown && files.status === 'ready' ? files.paths : null;

  const view = {
    title: 'Quick open',
    inputLabel: 'File name',
    placeholder: rootPath ? `Search files in ${rootPath}` : 'Search files',
    listLabel: 'Files',
    groupHeaders: false,
  };

  const results = useMemo(() => {
    if (!paths || !rootPath) return [];

    const recentPaths = recentFiles.map((file) => file.path);

    return rankFiles(paths, query, rootPath, recentPaths)
      .slice(0, MAX_FILE_ROWS)
      .map(({ path, index }): Command => ({
        id: `file-${index}`,
        label: documentName(path),
        detail: dirname(relativePath(path, rootPath)),
        run: () => void openPath(path),
      }));
  }, [paths, rootPath, query, recentFiles]);

  if (files.status === 'no-folder') {
    return { ...view, results: OPEN_FOLDER_ROWS, notice: 'No folder is open', footer: null };
  }

  if (files.status === 'loading') return { ...view, results, notice: `Reading ${rootPath}…`, footer: null };

  if (files.status === 'error') {
    return { ...view, results, notice: `Couldn't read ${rootPath}: ${files.message}`, footer: null };
  }

  const footer = files.truncated ? `Only the first ${MAX_FILES} files are searched` : null;

  if (!files.paths.length) return { ...view, results, notice: `No Markdown or Mermaid files in ${rootPath}`, footer };

  return { ...view, results, notice: results.length ? null : 'No matching files', footer };
}

export function CommandPalette() {
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const open = dialog === 'palette' || dialog === 'quickOpen';
  // Kept while closing, so the fading list never shows the other mode's rows
  const [mode, setMode] = useState<Mode>('commands');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  // Opening, or switching mode while open (Ctrl+P in the palette, Ctrl+Shift+P in Quick open), starts afresh
  useLayoutEffect(() => {
    if (dialog !== 'palette' && dialog !== 'quickOpen') return;

    setMode(dialog === 'palette' ? 'commands' : 'files');
    setQuery('');
    setActive(0);
  }, [dialog]);

  const commandView = useCommandRows(open && mode === 'commands', query);
  const fileView = useFileRows(mode === 'files', open && mode === 'files', query);
  const view = mode === 'commands' ? commandView : fileView;
  const { results } = view;
  // A query hides the headers; each row then names its group beside it
  const headers = view.groupHeaders && !query;

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // The active row's highlight slides between rows (after interior.dev); a new result list
  // places it without sliding, since the rows under it changed
  const [bar, setBar] = useState<{ top: number; height: number; jump: boolean } | null>(null);
  // The list mounts a render after the dialog opens (Radix portals), so track the element itself
  const [listEl, setListEl] = useState<HTMLUListElement | null>(null);
  const lastResults = useRef(results);
  useLayoutEffect(() => {
    const row = listEl?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    const jump = lastResults.current !== results || !bar;
    lastResults.current = results;
    setBar(row ? { top: row.offsetTop, height: row.offsetHeight, jump } : null);
  }, [active, results, listEl]);

  const runCommand = (command: Command | undefined) => {
    if (!command) return;
    closeDialog();
    // Let the dialog close (and focus return) before the command opens its own UI
    window.setTimeout(command.run, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0));
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(results.length - 1);
    else if (e.key === 'Enter') runCommand(results[active]);
    else return;
    e.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="ml-backdrop fixed inset-0 z-50 bg-[#1A1A1A]/25" />
        <Dialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={rememberFocus}
          onCloseAutoFocus={restoreFocus}
          className={cn(
            'fixed inset-x-0 mx-auto top-[14vh] z-50 w-[min(560px,calc(100%-2rem))]',
            'ml-dialog rounded-[14px] bg-canvas overflow-hidden outline-none',
            'shadow-[0_0_0_1px_rgba(26,26,26,0.12),0_2px_4px_rgba(26,26,26,0.06),0_24px_48px_-12px_rgba(26,26,26,0.22)]'
          )}
        >
          <Dialog.Title className="sr-only">{view.title}</Dialog.Title>
          <div className="flex items-center gap-2 px-4 border-b border-rule">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0" aria-hidden />
            {/* No autoFocus: Radix skips onOpenAutoFocus (and so rememberFocus) when focus is
                already inside, and focuses this first field itself */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={view.placeholder}
              aria-label={view.inputLabel}
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 h-12 bg-transparent text-[15px] text-text-primary placeholder:text-text-muted outline-none"
            />
          </div>
          <ul id="command-list" role="listbox" aria-label={view.listLabel} ref={(el) => {
              listRef.current = el;
              setListEl(el);
            }} className="relative max-h-[50vh] overflow-y-auto py-1.5">
            <li
              role="presentation"
              aria-hidden
              className="ml-menu-highlight left-1.5 right-1.5 bg-accent-muted"
              data-visible={bar ? '' : undefined}
              data-jump={bar?.jump ? '' : undefined}
              style={bar ? { transform: `translateY(${bar.top}px)`, height: bar.height } : undefined}
            />
            {view.notice && (
              <li className={cn('px-4 text-center text-sm text-text-muted', results.length ? 'py-3' : 'py-6')}>{view.notice}</li>
            )}
            {results.map((command, index) => {
              const showGroup = headers && (index === 0 || results[index - 1].group !== command.group);
              const aside = headers ? undefined : (command.detail ?? command.group);

              return (
                <li key={command.id} role="presentation">
                  {showGroup && (
                    <div className="px-4 pt-2 pb-1 text-[11px] font-medium text-text-muted" aria-hidden>
                      {command.group}
                    </div>
                  )}
                  <div
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => runCommand(command)}
                    className={cn(
                      'relative mx-1.5 flex items-center justify-between gap-4 rounded-[7px] px-2.5 py-1.5 text-sm text-text-primary cursor-default'
                    )}
                  >
                    <span className="truncate">{command.label}</span>
                    <span className="flex items-center gap-3 flex-shrink-0">
                      {aside && <span className="text-xs text-text-muted">{aside}</span>}
                      {command.shortcut && <Kbd id={command.shortcut} />}
                    </span>
                  </div>
                </li>
              );
            })}
            {view.footer && <li className="px-4 pt-2 pb-1 text-xs text-text-muted">{view.footer}</li>}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
