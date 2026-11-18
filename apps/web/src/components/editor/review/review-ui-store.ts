// DLT Cafe: UI state for the review panel (which panel is showing, which note is focused).
import { create } from "zustand";

interface ReviewUIState {
  open: boolean;
  focusedNoteId: string | null;
  /** Time frozen by the N shortcut for the note being typed (null = follow the playhead). */
  pendingT: number | null;
  /** Bumped to ask the composer to take focus. */
  composeToken: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  focusNote: (noteId: string | null) => void;
  startNoteAt: (t: number) => void;
  clearPending: () => void;
}

export const useReviewUIStore = create<ReviewUIState>((set) => ({
  open: false,
  focusedNoteId: null,
  pendingT: null,
  composeToken: 0,
  setOpen: (open) => set(open ? { open } : { open, pendingT: null }),
  toggle: () => set((s) => (s.open ? { open: false, pendingT: null } : { open: true })),
  focusNote: (focusedNoteId) => set({ focusedNoteId, ...(focusedNoteId ? { open: true } : {}) }),
  startNoteAt: (t) => set((s) => ({ open: true, pendingT: t, composeToken: s.composeToken + 1 })),
  clearPending: () => set({ pendingT: null }),
}));

const DOCK_WIDTH_KEY = "dltcafe-review-dock-width";
export const REVIEW_DOCK_MIN_W = 280;
export const REVIEW_DOCK_MAX_W = 560;
export const REVIEW_DOCK_DEFAULT_W = 340;

export function loadDockWidth(): number {
  try {
    const v = Number(localStorage.getItem(DOCK_WIDTH_KEY));
    if (Number.isFinite(v) && v >= REVIEW_DOCK_MIN_W && v <= REVIEW_DOCK_MAX_W) return v;
  } catch { /* storage unavailable */ }
  return REVIEW_DOCK_DEFAULT_W;
}

export function saveDockWidth(w: number): void {
  try { localStorage.setItem(DOCK_WIDTH_KEY, String(Math.round(w))); } catch { /* storage unavailable */ }
}

export function formatReviewTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return "";
  if (s < 45) return "just now";
  if (s < 90) return "1 min ago";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
