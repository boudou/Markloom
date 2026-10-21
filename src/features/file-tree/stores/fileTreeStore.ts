import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FileNode } from '../types';

interface FileTreeState {
  nodes: FileNode[];
  /**
   * Which opening of a folder this is, bumped by openRoot. Paths start with the folder's name,
   * so this is what tells two folders with the same name apart.
   */
  rootId: number;
  /** The rootId `nodes` were read from; null when they belong to no folder */
  nodesRoot: number | null;
  expandedPaths: Set<string>;
  selectedPath: string | null;
  isLoading: boolean;

  // Actions
  setNodes: (nodes: FileNode[], root: number | null) => void;
  /** A folder is opening: gives it a new rootId and drops the previous folder's tree, expanded folders and selection */
  openRoot: () => void;
  toggleExpanded: (path: string) => void;
  setSelected: (path: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateNode: (path: string, updates: Partial<FileNode>) => void;
}

export const useFileTreeStore = create<FileTreeState>()(
  immer((set) => ({
    nodes: [],
    rootId: 0,
    nodesRoot: null,
    expandedPaths: new Set<string>(),
    selectedPath: null,
    isLoading: false,

    setNodes: (nodes, root) =>
      set((state) => {
        state.nodes = nodes;
        state.nodesRoot = root;
      }),

    openRoot: () =>
      set((state) => {
        state.rootId += 1;
        state.nodes = [];
        state.isLoading = false;
        state.nodesRoot = null;
        state.expandedPaths = new Set<string>();
        state.selectedPath = null;
      }),

    toggleExpanded: (path) =>
      set((state) => {
        if (state.expandedPaths.has(path)) {
          state.expandedPaths.delete(path);
        } else {
          state.expandedPaths.add(path);
        }
      }),

    setSelected: (path) =>
      set((state) => {
        state.selectedPath = path;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    updateNode: (path, updates) =>
      set((state) => {
        const updateNodeRecursive = (nodes: FileNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === path) {
              Object.assign(node, updates);

              return true;
            }

            if (node.children && updateNodeRecursive(node.children)) {
              return true;
            }
          }

          return false;
        };

        updateNodeRecursive(state.nodes);
      }),
  }))
);
