import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SavedPaper {
  id: string;
  runId: string;
  paperId: string;
  title: string;
  authors: string;
  year: string;
  createdAt: string;
}

interface PapersState {
  papers: SavedPaper[];
  addPaper: (entry: Omit<SavedPaper, "id" | "createdAt">) => string;
  removePaper: (id: string) => void;
  fullReset: () => void;
}

export const usePapersStore = create<PapersState>()(
  persist(
    (set, get) => ({
      papers: [],

      addPaper: (entry) => {
        const paper: SavedPaper = {
          ...entry,
          id: `paper-${Date.now()}`,
          createdAt: new Date().toISOString(),
        };
        set({ papers: [paper, ...get().papers] });
        return paper.id;
      },

      removePaper: (id) => {
        set({ papers: get().papers.filter((p) => p.id !== id) });
      },

      fullReset: () => set({ papers: [] }),
    }),
    {
      name: "saral-papers-store",
      partialize: (state) => ({ papers: state.papers }),
    },
  ),
);
