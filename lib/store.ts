import { create } from "zustand";

// Ephemeral shell chrome only. Tunable component state lives in the URL (nuqs),
// not here — this store never holds anything worth sharing or deep-linking.
export type WorkspaceTab = "preview" | "code";

interface UIState {
  /** Mobile off-canvas sidebar. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  /** Active workspace tab. */
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;

  /** Sidebar fuzzy-search query. */
  search: string;
  setSearch: (query: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  activeTab: "preview",
  setActiveTab: (activeTab) => set({ activeTab }),

  search: "",
  setSearch: (search) => set({ search }),
}));
