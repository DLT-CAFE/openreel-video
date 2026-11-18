// DLT Cafe M2: editor layout preferences shared by the browser and desktop
// shells (persisted per browser profile).
import { create } from "zustand";

const KEY = "dltcafe-editor-layout";

interface LayoutState {
  mediaCollapsed: boolean;
  setMediaCollapsed: (collapsed: boolean) => void;
  toggleMedia: () => void;
}

function load(): Partial<LayoutState> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return typeof v.mediaCollapsed === "boolean" ? { mediaCollapsed: v.mediaCollapsed } : {};
  } catch {
    return {};
  }
}

function save(s: Pick<LayoutState, "mediaCollapsed">): void {
  try { localStorage.setItem(KEY, JSON.stringify({ mediaCollapsed: s.mediaCollapsed })); } catch { /* storage unavailable */ }
}

export const useEditorLayoutStore = create<LayoutState>((set, get) => ({
  mediaCollapsed: false,
  ...load(),
  setMediaCollapsed: (mediaCollapsed) => { set({ mediaCollapsed }); save(get()); },
  toggleMedia: () => { set({ mediaCollapsed: !get().mediaCollapsed }); save(get()); },
}));
