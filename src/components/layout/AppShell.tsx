import { useEffect } from 'react';
import { LazyMotion, MotionConfig } from 'framer-motion';

// The animation engine loads after first paint; components use the slim `m.*` elements
const loadMotionFeatures = () => import('@/lib/motionFeatures').then((mod) => mod.default);
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { StatusBar } from './StatusBar';
import { CloseGuardDialog } from './CloseGuardDialog';
import { CommandPalette } from './CommandPalette';
import { Toaster } from '@/components/ui';
import { EditorContainer } from '@/features/editor/components';
import { ExportModal } from '@/features/export/components';
import { useTheme } from '@/features/theme';
import { ShortcutsModal } from '@/features/shortcuts-panel';
import { TemplatesModal } from '@/features/templates';
import { TabBar, useTabsStore } from '@/features/tabs';
import { useAppStoreBase } from '@/stores/appStore';
import { useUiStore } from '@/stores/uiStore';
import {
  newDocument,
  openFile,
  openFolder,
  saveActiveTab,
  requestCloseTabs,
  hasUnsavedTabs,
} from '@/lib/documentActions';
import { SHORTCUTS, matchesCombo, type ShortcutId } from '@/lib/shortcuts';
import { initSession } from '@/lib/session';
import { startAutoSave } from '@/features/auto-save';
import { loadHighlighter } from '@/features/syntax-highlight';
import { initDesktopFiles } from '@/lib/desktopFiles';

// Module-level so React StrictMode's double effect doesn't start it twice
let sessionStarted = false;

// App-level shortcuts. Formatting shortcuts live in the editors themselves.
const globalActions: Partial<Record<ShortcutId, () => void>> = {
  newDocument,
  openFile: () => void openFile(),
  openFolder: () => void openFolder(),
  save: () => void saveActiveTab(),
  saveAs: () => void saveActiveTab({ saveAs: true }),
  closeTab: () => {
    const { activeTabId } = useTabsStore.getState();
    if (activeTabId) requestCloseTabs([activeTabId]);
  },
  export: () => useUiStore.getState().openDialog('export'),
  showShortcuts: () => useUiStore.getState().openDialog('shortcuts'),
  toggleSidebar: () => useAppStoreBase.getState().toggleSidebar(),
  commandPalette: () => useUiStore.getState().openDialog('palette'),
  toggleMode: () => {
    const app = useAppStoreBase.getState();
    app.setEditorMode(app.editorMode === 'split' ? 'wysiwyg' : 'split');
  },
  toggleOutline: () => useAppStoreBase.getState().toggleSidebarView('outline'),
  versionHistory: () => useUiStore.getState().setHistoryOpen(true),
};

export function AppShell() {
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);

  useTheme();

  useEffect(() => {
    if (sessionStarted) return;
    sessionStarted = true;
    // Session first, so files handed over by the OS become the new session rather than being replaced by it
    void initSession().then(initDesktopFiles);
    startAutoSave();
    // Fetch code highlighting once the window is up and idle (it's off the startup path)
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    idle(() => void loadHighlighter());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // An editor already handled it (e.g. a formatting key)
      if (e.defaultPrevented) return;
      for (const [id, action] of Object.entries(globalActions)) {
        if (matchesCombo(e, SHORTCUTS[id as ShortcutId].combo)) {
          e.preventDefault();
          action!();
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Never lose work to a closed window. The desktop shell turns this into a native prompt.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedTabs()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const dialogProps = (name: Exclude<typeof dialog, null>) => ({
    open: dialog === name,
    onOpenChange: (open: boolean) => {
      if (!open) closeDialog();
    },
  });

  return (
    <LazyMotion features={loadMotionFeatures} strict>
    <MotionConfig reducedMotion="user">
      <div className="h-screen flex flex-col bg-canvas overflow-hidden">
        {/* First Tab stop: straight to the writing surface */}
        <a
          href="#document"
          onClick={(e) => {
            e.preventDefault();
            document.querySelector<HTMLElement>('.cm-content, .rt-document')?.focus();
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:z-[70] focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-text-primary focus:text-canvas focus:text-sm"
        >
          Skip to document
        </a>
        <TitleBar />

        <div className="flex-1 flex min-h-0">
          <Sidebar />

          <main className="flex-1 flex flex-col min-w-0">
            <TabBar />
            <div className="flex-1 min-h-0">
              <EditorContainer />
            </div>
          </main>
        </div>

        <StatusBar />

        <ExportModal {...dialogProps('export')} />
        <ShortcutsModal {...dialogProps('shortcuts')} />
        <TemplatesModal {...dialogProps('templates')} />
        <CloseGuardDialog />
        <CommandPalette />
        <Toaster />
      </div>
    </MotionConfig>
    </LazyMotion>
  );
}
