import { create } from 'zustand';
import { type OutlineItemType } from '../utils';

interface OutlineState {
  isOpen: boolean;
  filterTypes: OutlineItemType[] | null;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setFilterTypes: (types: OutlineItemType[] | null) => void;
  toggleFilterType: (type: OutlineItemType) => void;
}

export const useOutlineStore = create<OutlineState>((set) => ({
  isOpen: false,
  filterTypes: null,

  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),

  setOpen: (open) => set({ isOpen: open }),

  setFilterTypes: (types) => set({ filterTypes: types }),

  toggleFilterType: (type) =>
    set((state) => {
      if (!state.filterTypes) {
        // If no filters, start filtering by this type only
        return { filterTypes: [type] };
      }

      const hasType = state.filterTypes.includes(type);
      if (hasType) {
        const newTypes = state.filterTypes.filter((t) => t !== type);
        return { filterTypes: newTypes.length > 0 ? newTypes : null };
      } else {
        return { filterTypes: [...state.filterTypes, type] };
      }
    }),
}));
