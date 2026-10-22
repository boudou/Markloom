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
import { ShortcutsModal } from '@/features/shortcuts-panel';
import { TemplatesModal } from '@/features/templates';
import { TabBar } from '@/features/tabs';
import { useUiStore } from '@/stores/uiStore';
import { useAppStore } from '@/stores/appStore';
import { hasUnsavedTabs } from '@/lib/documentActions';
import { commandForKey } from '@/lib/appCommands';
import { isDesktop } from '@/lib/shortcuts';
import { initSession } from '@/lib/session';
import { startAutoSave } from '@/features/auto-save';
import { loadHighlighter } from '@/features/syntax-highlight';
import { initDesktopFiles } from '@/lib/desktopFiles';
import { initLaunchedFiles } from '@/lib/launchedFiles';

// Module-level so React StrictMode's double effect doesn't start it twice
let sessionStarted = false;

export function AppShell() {
  const dialog = useUiStore((s) => s.dialog);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const focusMode = useAppStore((s) => s.focusMode);

  useEffect(() => {
    if (sessionStarted) return;
    sessionStarted = true;
    // Session first, so files handed over by the OS become the new session rather than being replaced by it
    void initSession().then(initDesktopFiles).then(initLaunchedFiles);
    startAutoSave();
    // Fetch code highlighting once the window is up and idle (it's off the startup path)
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));
    idle(() => void loadHighlighter());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // An editor already handled it (e.g. a formatting key)
      if (e.defaultPrevented) return;

      // Dialogs, menus and the find bar take their own Escape first (they prevent the default)
      if (e.key === 'Escape' && !e.isComposing && useAppStore.getState().focusMode) {
        useAppStore.getState().setFocusMode(false);

        return;
      }

      const command = commandForKey(e);

      if (!command) return;

      e.preventDefault();
      command.run();
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
      <div className="relative h-screen flex flex-col bg-canvas overflow-clip">
        {/* First Tab stop: straight to the writing surface */}
        <a
          href="#document"
          onClick={(e) => {
            e.preventDefault();
            // Never the Rich text editor kept hidden in Markdown mode
            document.querySelector<HTMLElement>('.cm-content, [data-doc-surface] .rt-document')?.focus();
          }}
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:z-[70] focus:px-3 focus:py-1.5 focus:rounded-md focus:bg-text-primary focus:text-canvas focus:text-sm"
        >
          Skip to document
        </a>
        {/* The desktop window draws its own buttons over the top 44px (titleBarOverlay), so focus
            mode keeps an empty strip there to drag the window by */}
        {!focusMode ? <TitleBar /> : isDesktop && <div className="h-11 flex-shrink-0 bg-panel app-drag-region" aria-hidden />}

        <div className="flex-1 flex min-h-0">
          <Sidebar />

          <main className="flex-1 flex flex-col min-w-0">
            {!focusMode && <TabBar />}
            {/* Skip link target: the wrapper, since both editors stay mounted and an id on each would clash */}
            <div id="document" className="flex-1 min-h-0">
              <EditorContainer />
            </div>
          </main>
        </div>

        {!focusMode && <StatusBar />}

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
