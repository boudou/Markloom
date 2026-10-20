import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Kbd, rememberFocus, restoreFocus } from '@/components/ui';
import { useUiStore } from '@/stores/uiStore';
import { useAppStoreBase } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useTabsStore } from '@/features/tabs';
import { useFindReplaceStore } from '@/features/find-replace';
import { mermaidTemplates } from '@/features/mermaid-toolbar';
import { readFile, documentName } from '@/features/file-tree/api/fileSystem';
import { newDocument, openFile, openFolder, requestCloseTabs, saveActiveTab } from '@/lib/documentActions';
import { shortcutKeys, type ShortcutId } from '@/lib/shortcuts';
import { notify } from '@/stores/uiStore';
import type { MarkdownAction } from '@/features/editor/types';

interface Command {
  id: string;
  label: string;
  group: string;
  shortcut?: ShortcutId;
  run: () => void;
}

function useCommands(): Command[] {
  const editorCommands = useUiStore((s) => s.editorCommands);
  const editorMode = useAppStoreBase((s) => s.editorMode);
  const outlineOpen = useAppStoreBase((s) => s.sidebarOpen && s.sidebarView === 'outline');
  const rootPath = useAppStoreBase((s) => s.rootPath);
  const recentFiles = useSettingsStore((s) => s.recentFiles);

  return useMemo(() => {
    const ui = useUiStore.getState();
    const app = useAppStoreBase.getState();
    const commands: Command[] = [
      { id: 'new', label: 'New document', group: 'File', shortcut: 'newDocument', run: newDocument },
      { id: 'open', label: 'Open file…', group: 'File', shortcut: 'openFile', run: () => void openFile() },
      { id: 'open-folder', label: 'Open folder…', group: 'File', shortcut: 'openFolder', run: () => void openFolder() },
      { id: 'save', label: 'Save', group: 'File', shortcut: 'save', run: () => void saveActiveTab() },
      { id: 'save-as', label: 'Save as…', group: 'File', shortcut: 'saveAs', run: () => void saveActiveTab({ saveAs: true }) },
      { id: 'export', label: 'Export…', group: 'File', shortcut: 'export', run: () => ui.openDialog('export') },
      { id: 'templates', label: 'New from template…', group: 'File', run: () => ui.openDialog('templates') },
      {
        id: 'close-tab',
        label: 'Close tab',
        group: 'File',
        shortcut: 'closeTab',
        run: () => {
          const { activeTabId } = useTabsStore.getState();
          if (activeTabId) requestCloseTabs([activeTabId]);
        },
      },
      {
        id: 'mode',
        label: editorMode === 'split' ? 'Switch to Rich text' : 'Switch to Markdown',
        group: 'View',
        shortcut: 'toggleMode',
        run: () => app.setEditorMode(editorMode === 'split' ? 'wysiwyg' : 'split'),
      },
      {
        id: 'outline',
        label: outlineOpen ? 'Hide contents' : 'Show contents (outline)',
        group: 'View',
        shortcut: 'toggleOutline',
        run: () => app.toggleSidebarView('outline'),
      },
      { id: 'history', label: 'Version history', group: 'View', shortcut: 'versionHistory', run: () => ui.setHistoryOpen(true) },
      { id: 'find', label: 'Find', group: 'Edit', shortcut: 'find', run: () => useFindReplaceStore.getState().open(false) },
      { id: 'replace', label: 'Find and replace', group: 'Edit', shortcut: 'replace', run: () => useFindReplaceStore.getState().open(true) },
      { id: 'shortcuts', label: 'Keyboard shortcuts', group: 'Help', shortcut: 'showShortcuts', run: () => ui.openDialog('shortcuts') },
    ];

    if (rootPath) {
      commands.push({ id: 'files', label: 'Show or hide files', group: 'View', run: () => app.toggleSidebarView('files') });
    }

    if (editorCommands) {
      const format = (id: MarkdownAction, label: string, shortcut?: ShortcutId): Command => ({
        id: `format-${id}`,
        label,
        group: 'Format',
        shortcut,
        run: () => editorCommands.run(id),
      });
      commands.push(
        format('bold', 'Bold', 'bold'),
        format('italic', 'Italic', 'italic'),
        format('strikethrough', 'Strikethrough', 'strikethrough'),
        format('code', 'Inline code', 'inlineCode'),
        format('link', 'Link…', 'link'),
        format('paragraph', 'Body text'),
        format('h1', 'Heading 1', 'heading1'),
        format('h2', 'Heading 2', 'heading2'),
        format('h3', 'Heading 3', 'heading3'),
        format('ul', 'Bulleted list', 'bulletList'),
        format('ol', 'Numbered list', 'orderedList'),
        format('checkbox', 'Task list', 'taskList'),
        format('quote', 'Quote', 'blockquote'),
        { ...format('codeblock', 'Insert code block', 'codeBlock'), group: 'Insert' },
        { ...format('table', 'Insert table'), group: 'Insert' },
        { ...format('hr', 'Insert divider'), group: 'Insert' },
        { ...format('image', 'Insert image…'), group: 'Insert' },
        ...mermaidTemplates.map((template) => ({
          id: `diagram-${template.id}`,
          label: `Insert ${template.name.toLowerCase()}`,
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
        run: async () => {
          try {
            useTabsStore.getState().openDocument(file.path, await readFile(file.path));
          } catch (error) {
            notify({
              tone: 'error',
              title: `Couldn't open ${documentName(file.path)}`,
              detail: error instanceof Error ? error.message : String(error),
            });
          }
        },
      });
    }
    return commands;
  }, [editorCommands, editorMode, outlineOpen, rootPath, recentFiles]);
}

/** Every words of the query must appear; labels starting with the query rank first. */
function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  return commands
    .filter((c) => {
      const haystack = `${c.label} ${c.group}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => Number(b.label.toLowerCase().startsWith(words[0])) - Number(a.label.toLowerCase().startsWith(words[0])));
}

export function CommandPalette() {
  const open = useUiStore((s) => s.dialog === 'palette');
  const closeDialog = useUiStore((s) => s.closeDialog);
  const commands = useCommands();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

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
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-2 px-4 border-b border-rule">
            <Search className="w-4 h-4 text-text-muted flex-shrink-0" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a command or file name"
              aria-label="Command"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 h-12 bg-transparent text-[15px] text-text-primary placeholder:text-text-muted outline-none"
            />
          </div>
          <ul id="command-list" role="listbox" aria-label="Commands" ref={(el) => {
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
            {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-muted">No matching commands</li>}
            {results.map((command, index) => {
              const showGroup = index === 0 || results[index - 1].group !== command.group;
              return (
                <li key={command.id} role="presentation">
                  {showGroup && !query && (
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
                      {query && <span className="text-xs text-text-muted">{command.group}</span>}
                      {command.shortcut && <Kbd>{shortcutKeys(command.shortcut)}</Kbd>}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
