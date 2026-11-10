import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, RefreshCw, AlertCircle, FilePlus, FolderPlus } from 'lucide-react';
import { m } from 'framer-motion';
import { Button, IconButton, Input, Modal, ModalFooter, Tooltip } from '@/components/ui';
import { useFileTreeStore } from '../stores/fileTreeStore';
import { useAppStore } from '@/stores/appStore';
import {
  readDirectory,
  isFileSystemSupported,
  documentName,
  createEntry,
  documentFileName,
  entryNameProblem,
  type EntryKind,
} from '../api/fileSystem';
import { openFolder, openPath } from '@/lib/documentActions';
import { notify } from '@/stores/uiStore';
import { TreeNode } from './TreeNode';
import { errorMessage } from '@/lib/utils';

// Each read of the open folder takes the next number; only the latest may change the tree or report an error.
// Kept outside the component so a read from before the sidebar remounted the tree is still superseded.
let latestLoad = 0;

// Module-level, so the memo'd TreeNodes get the same callback on every render
function openFromTree(path: string): void {
  void openPath(path);
}

/** A new file or folder waiting for its name */
interface CreateRequest {
  folder: string;
  kind: EntryKind;
}

export function FileTree() {
  const nodes = useFileTreeStore((s) => s.nodes);
  const rootId = useFileTreeStore((s) => s.rootId);
  const nodesRoot = useFileTreeStore((s) => s.nodesRoot);
  const isLoading = useFileTreeStore((s) => s.isLoading);
  const setNodes = useFileTreeStore((s) => s.setNodes);
  const setLoading = useFileTreeStore((s) => s.setLoading);
  const rootPath = useAppStore((s) => s.rootPath);

  const isSupported = isFileSystemSupported();

  const loadDirectory = useCallback(
    async (path: string, root: number) => {
      const load = ++latestLoad;
      // A newer read (Refresh, or another folder opening) owns the tree and the spinner
      const superseded = () => load !== latestLoad || useFileTreeStore.getState().rootId !== root;

      setLoading(true);

      try {
        const read = await readDirectory(path);

        if (superseded()) return;
        setNodes(read, root);
      } catch (error) {
        if (superseded()) return;

        // A failed Refresh keeps the tree; a folder that failed to open shows none (openRoot already cleared it)
        notify({
          tone: 'error',
          title: `Couldn't read ${documentName(path)}`,
          detail: errorMessage(error),
        });
      }

      setLoading(false);
    },
    [setNodes, setLoading]
  );

  // Reads the folder only when the store doesn't hold it yet, so the tree (and its expanded folders)
  // survives the sidebar switching to Outline and back; Refresh is the way to re-read it
  useEffect(() => {
    if (rootPath && nodesRoot !== rootId) {
      void loadDirectory(rootPath, rootId);
    }
  }, [rootPath, rootId, nodesRoot, loadDirectory]);

  const handleRefresh = useCallback(() => {
    if (rootPath) {
      void loadDirectory(rootPath, rootId);
    }
  }, [rootPath, rootId, loadDirectory]);

  const [creating, setCreating] = useState<CreateRequest | null>(null);
  // Stable, so the memo'd TreeNodes don't all re-render
  const requestCreate = useCallback((folder: string, kind: EntryKind) => setCreating({ folder, kind }), []);

  // Creates the entry, shows it in the tree and opens a new file. Returns the message to show, or null on success.
  const createInFolder = useCallback(
    async ({ folder, kind }: CreateRequest, rawName: string): Promise<string | null> => {
      const root = useFileTreeStore.getState().rootId;
      const name = kind === 'file' ? documentFileName(rawName) : rawName.trim();
      const path = `${folder}/${name}`;
      let result: 'created' | 'exists';

      try {
        result = await createEntry(path, kind);
      } catch (error) {
        return `Couldn't create ${name}: ${errorMessage(error)}`;
      }

      if (result === 'exists') return `${name} already exists in ${documentName(folder)}`;

      const tree = useFileTreeStore.getState();

      // Another folder opened meanwhile: its tree has nothing to show
      if (tree.rootId !== root) return null;

      if (folder === useAppStore.getState().rootPath) {
        void loadDirectory(folder, root);
      } else {
        // Unloading an expanded folder makes its TreeNode read it again
        tree.updateNode(folder, { children: undefined, loadError: undefined });

        if (!tree.expandedPaths.has(folder)) tree.toggleExpanded(folder);
      }

      if (kind === 'file') {
        tree.setSelected(path);
        void openPath(path);
      }

      return null;
    },
    [loadDirectory]
  );

  const closeDialog = useCallback(() => setCreating(null), []);

  // Show browser compatibility warning
  if (!isSupported) {
    return (
      <div className="h-full flex flex-col bg-panel">
        <div className="flex items-center justify-between px-3 py-2 border-b border-rule/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Explorer
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <AlertCircle className="w-10 h-10 text-warning mx-auto mb-3" />
            <p className="text-sm text-text-secondary mb-2">Browser not supported</p>
            <p className="text-xs text-text-muted">
              Please use Chrome, Edge, or another Chromium-based browser for full file system access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-panel">
      {/* Header */}
      <div className="h-8 flex items-center justify-between gap-2 pl-4 pr-1.5 border-b border-rule">
        <h2 className="min-w-0 truncate text-xs font-medium text-text-secondary" title={rootPath ?? undefined}>
          {rootPath ? documentName(rootPath) : 'Files'}
        </h2>
        <div className="flex items-center gap-0.5 shrink-0">
          {rootPath && (
            <>
              <Tooltip content="New file">
                <IconButton variant="ghost" size="sm" onClick={() => requestCreate(rootPath, 'file')}>
                  <FilePlus className="w-4 h-4" />
                </IconButton>
              </Tooltip>
              <Tooltip content="New folder">
                <IconButton variant="ghost" size="sm" onClick={() => requestCreate(rootPath, 'folder')}>
                  <FolderPlus className="w-4 h-4" />
                </IconButton>
              </Tooltip>
            </>
          )}
          <Tooltip content="Open another folder">
            <IconButton variant="ghost" size="sm" onClick={() => void openFolder()}>
              <FolderOpen className="w-4 h-4" />
            </IconButton>
          </Tooltip>
          {rootPath && (
            <Tooltip content="Refresh">
              <IconButton variant="ghost" size="sm" onClick={handleRefresh}>
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Tree content */}
      <div className="flex-1 overflow-auto py-2">
        {!rootPath && nodes.length === 0 ? (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full px-4 text-center"
          >
            <FolderOpen className="w-12 h-12 text-text-muted/50 mb-4" />
            <p className="text-sm text-text-secondary mb-2">No folder open</p>
            <p className="text-xs text-text-muted mb-4">
              Open a folder to browse your markdown files
            </p>
            <button
              onClick={() => void openFolder()}
              className="text-sm text-accent-primary hover:text-accent-hover transition-colors"
            >
              Open folder
            </button>
          </m.div>
        ) : (
          // Keyed by the open folder: a same-name folder's nodes share paths but must not reuse the old TreeNodes
          <div key={rootId} className="px-1">
            {nodes.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                depth={0}
                onFileSelect={openFromTree}
                onCreate={requestCreate}
              />
            ))}
          </div>
        )}
      </div>

      <NewEntryDialog request={creating} onClose={closeDialog} onCreate={createInFolder} />
    </div>
  );
}

interface NewEntryDialogProps {
  request: CreateRequest | null;
  onClose: () => void;
  /** Resolves to the message to show, or null once the entry exists */
  onCreate: (request: CreateRequest, name: string) => Promise<string | null>;
}

/** Asks for the name of a new file or folder; stays open with the reason when it can't be created */
function NewEntryDialog({ request, onClose, onCreate }: NewEntryDialogProps) {
  const [name, setName] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) {
      setName('');
      setFailure(null);
      setBusy(false);
    }
  }, [request]);

  const isFile = request?.kind === 'file';
  const problem = request ? entryNameProblem(name, request.kind) : null;
  // An empty field says nothing yet; Create stays disabled
  const message = (name.trim() ? problem : null) ?? failure;
  const fileName = isFile && !problem ? documentFileName(name) : null;

  const submit = async (target: CreateRequest) => {
    setBusy(true);
    const result = await onCreate(target, name);

    setBusy(false);

    if (result === null) onClose();
    else setFailure(result);
  };

  return (
    <Modal
      open={!!request}
      onOpenChange={(open) => !open && onClose()}
      title={isFile ? 'New file' : 'New folder'}
      description={request ? `In ${documentName(request.folder)}` : undefined}
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();

          if (request && !problem && !busy) void submit(request);
        }}
        className="space-y-4"
      >
        <label className="block text-sm">
          <span className="text-text-secondary">Name</span>
          <Input
            data-autofocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setFailure(null);
            }}
            placeholder={isFile ? 'notes.md' : 'drafts'}
            className="mt-1.5"
          />
        </label>
        {fileName && fileName !== name.trim() && <p className="text-xs text-text-muted">Creates {fileName}</p>}
        {message && (
          <p role="alert" className="text-xs text-error-text">
            {message}
          </p>
        )}
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!!problem || busy}>
            Create
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
