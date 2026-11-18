// DLT Cafe M3: one "Collaborate" panel for the AI chat and the review notes.
// Docked as a full-height column by default; can float as a movable window;
// closes to a floating launcher button. Replaces the separate chat column,
// the review dock and the "Manual | AI editing" mode switch.
import { create } from "zustand";
import { useUIStore } from "../../../stores/ui-store";
import { useReviewUIStore } from "../review/review-ui-store";

export type CollabTab = "chat" | "notes";
export type CollabMode = "docked" | "floating";
export type CollabSide = "left" | "right";

export interface FloatRect { x: number; y: number; w: number; h: number }

interface CollabState {
  open: boolean;
  tab: CollabTab;
  mode: CollabMode;
  side: CollabSide;
  float: FloatRect;
  openPanel: (tab?: CollabTab) => void;
  close: () => void;
  toggle: () => void;
  setTab: (tab: CollabTab) => void;
  setMode: (mode: CollabMode) => void;
  setFloat: (rect: FloatRect) => void;
  setSide: (side: CollabSide) => void;
}

const KEY = "dltcafe-collab-panel";
export const DEFAULT_FLOAT: FloatRect = { x: -1, y: 96, w: 380, h: 560 };

function load(): Partial<Pick<CollabState, "tab" | "mode" | "float" | "side">> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Record<string, unknown>;
    const f = v.float as FloatRect | undefined;
    return {
      ...(v.tab === "chat" || v.tab === "notes" ? { tab: v.tab } : {}),
      ...(v.mode === "docked" || v.mode === "floating" ? { mode: v.mode } : {}),
      ...(v.side === "left" || v.side === "right" ? { side: v.side } : {}),
      ...(f && [f.x, f.y, f.w, f.h].every((n) => typeof n === "number" && Number.isFinite(n)) ? { float: f } : {}),
    };
  } catch {
    return {};
  }
}

function save(s: Pick<CollabState, "tab" | "mode" | "float" | "side">): void {
  try { localStorage.setItem(KEY, JSON.stringify({ tab: s.tab, mode: s.mode, float: s.float, side: s.side })); } catch { /* storage unavailable */ }
}

export const useCollabStore = create<CollabState>((set, get) => ({
  open: false,
  tab: "chat",
  mode: "docked",
  side: "right",
  float: DEFAULT_FLOAT,
  ...load(),
  openPanel: (tab) => set((s) => ({ open: true, tab: tab ?? s.tab })),
  close: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
  setTab: (tab) => { set({ tab }); save(get()); },
  setMode: (mode) => { set({ mode }); save(get()); },
  setFloat: (float) => { set({ float }); save(get()); },
  setSide: (side) => { set({ side }); save(get()); },
}));

let bridged = false;
let chatBridgeEnabled = true;

/** Compact (phone/tablet) layouts keep their own full-screen "AI" tab. */
export function setCollabChatBridgeEnabled(enabled: boolean): void {
  chatBridgeEnabled = enabled;
}

/**
 * Keep the older entry points working: anything that opens the AI chat panel
 * (search "ask AI", menus) or the review notes (N / Shift+N, note pins) opens
 * this panel on the right tab instead. Idempotent.
 */
export function installCollabBridges(): () => void {
  if (bridged) return () => {};
  bridged = true;
  const offChat = useUIStore.subscribe((state) => {
    if (chatBridgeEnabled && state.panels.agentChat?.visible) {
      useCollabStore.getState().openPanel("chat");
      useUIStore.getState().setPanelVisible("agentChat", false);
    }
  });
  const offReview = useReviewUIStore.subscribe((state, prev) => {
    if (state.open && !prev.open) useCollabStore.getState().openPanel("notes");
  });
  // Notes count as "open" (plain N adds a note) only while the notes tab shows.
  const offCollab = useCollabStore.subscribe((state) => {
    const notesVisible = state.open && state.tab === "notes";
    const review = useReviewUIStore.getState();
    if (review.open !== notesVisible) review.setOpen(notesVisible);
  });
  if (chatBridgeEnabled && useUIStore.getState().panels.agentChat?.visible) {
    useCollabStore.getState().openPanel("chat");
    useUIStore.getState().setPanelVisible("agentChat", false);
  }
  return () => {
    offChat();
    offReview();
    offCollab();
    bridged = false;
  };
}
