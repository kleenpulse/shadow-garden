import { create } from "zustand";
import { persist } from "zustand/middleware";

// Ephemeral shell chrome only. Tunable component state lives in the URL (nuqs),
// not here — this store never holds anything worth sharing or deep-linking.
export type WorkspaceTab = "preview" | "code";
// "new" is a freshness slice, not a tier — it only ever appears in the sidebar
// filter once at least one entry is inside the New window (lib/registry/freshness).
export type CatalogFilter = "all" | "free" | "pro" | "new";

// Desktop sidebar resize band. Default matches the historical `w-72` (288px).
// The pre-paint script in app/layout.tsx reads the same clamps — keep in sync.
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 480;
export const SIDEBAR_DEFAULT = 288;

const clampWidth = (w: number) =>
  Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w));

interface UIState {
  /** Mobile off-canvas sidebar. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  /** Desktop sidebar width (px), drag-resizable and persisted. */
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  /** Active workspace tab. */
  activeTab: WorkspaceTab;
  setActiveTab: (tab: WorkspaceTab) => void;

  /** Sidebar fuzzy-search query. */
  search: string;
  setSearch: (query: string) => void;

  /** Sidebar catalog filter (All/Free/Pro/New). */
  catalogFilter: CatalogFilter;
  setCatalogFilter: (filter: CatalogFilter) => void;

  /** Global command palette overlay (ephemeral — never persisted). */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  togglePalette: () => void;

  /** A floating page overlay has claimed the screen corners (e.g. the cookbook
   * section nav), so corner-anchored chrome like GotoTop should stand down. */
  navOverlayOpen: boolean;
  setNavOverlayOpen: (open: boolean) => void;

  /** Manual pause of the previewed animation (ephemeral; reset per component). */
  paused: boolean;
  setPaused: (paused: boolean) => void;
  togglePaused: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      sidebarWidth: SIDEBAR_DEFAULT,
      setSidebarWidth: (width) => set({ sidebarWidth: clampWidth(width) }),

      activeTab: "preview",
      setActiveTab: (activeTab) => set({ activeTab }),

      search: "",
      setSearch: (search) => set({ search }),

      catalogFilter: "all",
      setCatalogFilter: (catalogFilter) => set({ catalogFilter }),

      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      togglePalette: () => set((state) => ({ paletteOpen: !state.paletteOpen })),

      navOverlayOpen: false,
      setNavOverlayOpen: (navOverlayOpen) => set({ navOverlayOpen }),

      paused: false,
      setPaused: (paused) => set({ paused }),
      togglePaused: () => set((state) => ({ paused: !state.paused })),
    }),
    {
      name: "sg-ui",
      // Width + catalog filter survive a reload; open/search/tab stay ephemeral.
      // lib/catalog-filter-script.ts reads this same key/shape before first
      // paint — change the shape here and that script goes quietly stale.
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        catalogFilter: state.catalogFilter,
      }),
    },
  ),
);
