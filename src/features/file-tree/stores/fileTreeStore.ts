import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { FileNode } from '../types';

interface FileTreeState {
  nodes: FileNode[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  isLoading: boolean;

  // Actions
  setNodes: (nodes: FileNode[]) => void;
  toggleExpanded: (path: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  setSelected: (path: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateNode: (path: string, updates: Partial<FileNode>) => void;
  addNode: (parentPath: string, node: FileNode) => void;
  removeNode: (path: string) => void;
}

export const useFileTreeStore = create<FileTreeState>()(
  immer((set) => ({
    nodes: [],
    expandedPaths: new Set<string>(),
    selectedPath: null,
    isLoading: false,

    setNodes: (nodes) =>
      set((state) => {
        state.nodes = nodes;
      }),

    toggleExpanded: (path) =>
      set((state) => {
        if (state.expandedPaths.has(path)) {
          state.expandedPaths.delete(path);
        } else {
          state.expandedPaths.add(path);
        }
      }),

    setExpanded: (path, expanded) =>
      set((state) => {
        if (expanded) {
          state.expandedPaths.add(path);
        } else {
          state.expandedPaths.delete(path);
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

    addNode: (parentPath, newNode) =>
      set((state) => {
        const addNodeRecursive = (nodes: FileNode[]): boolean => {
          for (const node of nodes) {
            if (node.path === parentPath && node.isDirectory) {
              if (!node.children) node.children = [];
              node.children.push(newNode);
              node.children.sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) {
                  return a.isDirectory ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              });
              return true;
            }
            if (node.children && addNodeRecursive(node.children)) {
              return true;
            }
          }
          return false;
        };
        addNodeRecursive(state.nodes);
      }),

    removeNode: (path) =>
      set((state) => {
        const removeNodeRecursive = (nodes: FileNode[]): FileNode[] => {
          return nodes.filter((node) => {
            if (node.path === path) return false;
            if (node.children) {
              node.children = removeNodeRecursive(node.children);
            }
            return true;
          });
        };
        state.nodes = removeNodeRecursive(state.nodes);
        state.expandedPaths.delete(path);
        if (state.selectedPath === path) {
          state.selectedPath = null;
        }
      }),
  }))
);
