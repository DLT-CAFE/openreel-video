// DLT Cafe: UI state for the review panel (which panel is showing, which note is focused).
import { create } from "zustand";

interface ReviewUIState {
  open: boolean;
  focusedNoteId: string | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  focusNote: (noteId: string | null) => void;
}

export const useReviewUIStore = create<ReviewUIState>((set) => ({
  open: false,
  focusedNoteId: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  focusNote: (focusedNoteId) => set({ focusedNoteId, ...(focusedNoteId ? { open: true } : {}) }),
}));

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
