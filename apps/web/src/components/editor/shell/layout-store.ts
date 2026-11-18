// DLT Cafe M2/M6: editor layout preferences and saved workspaces, shared by
// the browser and desktop shells (persisted per browser profile; the hosted
// version can later sync these to the account).
import { create } from "zustand";

const KEY = "dltcafe-editor-layout";
const WS_KEY = "dltcafe-workspaces";

export interface EditorLayout {
  mediaCollapsed: boolean;
  /** null = pick from the screen width on first use. */
  mediaWidth: number | null;
  inspectorWidth: number | null;
  landscapeTimelineVh: number;
  portraitTimelineVh: number;
  /** Media drawer on the right, Inspector on the left. */
  swapSides: boolean;
}

export interface CollabLayout {
  open: boolean;
  mode: "docked" | "floating";
  tab: "chat" | "notes";
  side: "left" | "right";
}

export interface Workspace {
  id: string;
  name: string;
  builtin?: boolean;
  layout: Partial<EditorLayout>;
  collab?: Partial<CollabLayout>;
}

export const DEFAULT_LAYOUT: EditorLayout = {
  mediaCollapsed: false,
  mediaWidth: null,
  inspectorWidth: null,
  landscapeTimelineVh: 42,
  portraitTimelineVh: 28,
  swapSides: false,
};

export const BUILTIN_WORKSPACES: readonly Workspace[] = [
  { id: "edit", name: "Edit", builtin: true, layout: { ...DEFAULT_LAYOUT }, collab: { open: false, side: "right", mode: "docked" } },
  { id: "review", name: "Review", builtin: true, layout: { mediaCollapsed: true, landscapeTimelineVh: 32, portraitTimelineVh: 26 }, collab: { open: true, tab: "notes", mode: "docked", side: "right" } },
  { id: "ai", name: "AI edit", builtin: true, layout: { mediaCollapsed: false, landscapeTimelineVh: 36 }, collab: { open: true, tab: "chat", mode: "docked", side: "right" } },
  { id: "vertical", name: "Vertical", builtin: true, layout: { mediaCollapsed: true, portraitTimelineVh: 24 }, collab: { open: false } },
  { id: "timeline", name: "Timeline focus", builtin: true, layout: { mediaCollapsed: true, landscapeTimelineVh: 58, portraitTimelineVh: 50 }, collab: { open: false } },
];

const num = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;

export function sanitizeLayout(v: unknown): Partial<EditorLayout> {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const out: Partial<EditorLayout> = {};
  if (typeof o.mediaCollapsed === "boolean") out.mediaCollapsed = o.mediaCollapsed;
  if (typeof o.swapSides === "boolean") out.swapSides = o.swapSides;
  if (o.mediaWidth === null) out.mediaWidth = null; else if (num(o.mediaWidth, 200, 1200) !== undefined) out.mediaWidth = o.mediaWidth as number;
  if (o.inspectorWidth === null) out.inspectorWidth = null; else if (num(o.inspectorWidth, 200, 1200) !== undefined) out.inspectorWidth = o.inspectorWidth as number;
  if (num(o.landscapeTimelineVh, 10, 90) !== undefined) out.landscapeTimelineVh = o.landscapeTimelineVh as number;
  if (num(o.portraitTimelineVh, 10, 90) !== undefined) out.portraitTimelineVh = o.portraitTimelineVh as number;
  return out;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

function loadWorkspaces(): Workspace[] {
  const raw = read<unknown>(WS_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is Workspace => !!w && typeof w === "object" && typeof (w as Workspace).id === "string" && typeof (w as Workspace).name === "string")
    .slice(0, 50)
    .map((w) => ({ id: w.id, name: w.name.slice(0, 60), layout: sanitizeLayout(w.layout), ...(w.collab ? { collab: w.collab } : {}) }));
}

interface LayoutState extends EditorLayout {
  saved: Workspace[];
  activeWorkspaceId: string | null;
  setMediaCollapsed: (collapsed: boolean) => void;
  toggleMedia: () => void;
  setLayout: (patch: Partial<EditorLayout>) => void;
  applyWorkspaceLayout: (ws: Workspace) => void;
  saveWorkspace: (name: string, layout: EditorLayout, collab: CollabLayout) => Workspace;
  deleteWorkspace: (id: string) => void;
}

export const useEditorLayoutStore = create<LayoutState>((set, get) => {
  const persist = () => {
    const s = get();
    write(KEY, {
      mediaCollapsed: s.mediaCollapsed, mediaWidth: s.mediaWidth, inspectorWidth: s.inspectorWidth,
      landscapeTimelineVh: s.landscapeTimelineVh, portraitTimelineVh: s.portraitTimelineVh, swapSides: s.swapSides,
      activeWorkspaceId: s.activeWorkspaceId,
    });
  };
  const stored = read<Record<string, unknown>>(KEY, {});
  return {
    ...DEFAULT_LAYOUT,
    ...sanitizeLayout(stored),
    activeWorkspaceId: typeof stored.activeWorkspaceId === "string" ? stored.activeWorkspaceId : null,
    saved: loadWorkspaces(),
    setMediaCollapsed: (mediaCollapsed) => { set({ mediaCollapsed }); persist(); },
    toggleMedia: () => { set({ mediaCollapsed: !get().mediaCollapsed }); persist(); },
    setLayout: (patch) => { set(sanitizeLayout(patch)); persist(); },
    applyWorkspaceLayout: (ws) => { set({ ...DEFAULT_LAYOUT, ...sanitizeLayout(ws.layout), activeWorkspaceId: ws.id }); persist(); },
    saveWorkspace: (name, layout, collab) => {
      const trimmed = name.trim().slice(0, 60) || "My workspace";
      const existing = get().saved.find((w) => w.name.toLowerCase() === trimmed.toLowerCase());
      const ws: Workspace = { id: existing?.id ?? `ws-${Date.now().toString(36)}`, name: trimmed, layout: sanitizeLayout(layout), collab };
      const saved = existing ? get().saved.map((w) => (w.id === ws.id ? ws : w)) : [...get().saved, ws];
      set({ saved, activeWorkspaceId: ws.id });
      write(WS_KEY, saved);
      persist();
      return ws;
    },
    deleteWorkspace: (id) => {
      const saved = get().saved.filter((w) => w.id !== id);
      set({ saved, ...(get().activeWorkspaceId === id ? { activeWorkspaceId: null } : {}) });
      write(WS_KEY, saved);
      persist();
    },
  };
});

export function currentLayout(): EditorLayout {
  const s = useEditorLayoutStore.getState();
  return {
    mediaCollapsed: s.mediaCollapsed, mediaWidth: s.mediaWidth, inspectorWidth: s.inspectorWidth,
    landscapeTimelineVh: s.landscapeTimelineVh, portraitTimelineVh: s.portraitTimelineVh, swapSides: s.swapSides,
  };
}
