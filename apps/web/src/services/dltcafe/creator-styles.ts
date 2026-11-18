// DLT Cafe: the creator pack's editing styles, read live from the local pack
// folder. Licensed content, so it is never bundled: the desktop app serves it on
// app://openreel/__dltcafe/styles/, the browser gets it from the local openreel-mcp
// hub once the tab is paired (Settings > MCP). New styles show up without a rebuild.
import { create } from "zustand";
import { DEFAULT_HUB_PORT, useWebMcpBridge } from "./mcp-web-bridge";

export type StyleKind = "reel" | "long" | "clips" | "caption" | string;

export interface CreatorStyle {
  readonly id: string;
  readonly name: string;
  readonly kind: StyleKind;
  readonly blurb?: string;
  readonly aliases?: readonly string[];
  readonly layouts?: readonly string[];
  readonly caption?: string;
  readonly hook?: string;
  /** What footage suits it. */
  readonly cues?: string;
  readonly lends?: Readonly<Record<string, string>>;
  readonly matte?: boolean;
  readonly tags?: readonly string[];
  readonly media: {
    poster?: string;
    loop?: string;
    variants: readonly string[];
    live?: string;
    liveOptions?: { width: number; height: number; cycleClasses?: readonly string[] };
  };
  readonly skillPath?: string;
  readonly paths: Readonly<Record<string, string>>;
}

export interface CreatorStylesIndex {
  readonly root: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly styles: readonly CreatorStyle[];
}

export const KIND_LABEL: Record<string, string> = { reel: "Reel", long: "Long form", clips: "Clips", caption: "Captions" };

/** Canvas for a new project in this style: vertical for reels/clips/captions, 16:9 for long form. */
export function canvasForKind(kind: StyleKind): { width: number; height: number } {
  return kind === "long" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
}

const isDesktop = (): boolean => typeof window !== "undefined" && window.openreel?.platform === "desktop";

/** Base URL for style files, or null when the browser tab isn't paired with the bridge. */
export function stylesBase(): string | null {
  if (isDesktop()) return "app://openreel/__dltcafe/styles/";
  const { code, port, status } = useWebMcpBridge.getState();
  if (!code || status === "bad-code") return null;
  return `http://127.0.0.1:${port || DEFAULT_HUB_PORT}/styles/k/${encodeURIComponent(code)}/`;
}

export function styleMediaUrl(file: string | undefined): string | undefined {
  const base = stylesBase();
  return base && file ? `${base}media/${encodeURIComponent(file)}` : undefined;
}

export function styleLiveUrl(style: CreatorStyle): string | undefined {
  const base = stylesBase();
  return base && style.media.live ? `${base}skills/${style.media.live.split("/").map(encodeURIComponent).join("/")}` : undefined;
}

export type StylesStatus = "idle" | "loading" | "ready" | "error" | "unpaired";

interface StylesState {
  status: StylesStatus;
  index: CreatorStylesIndex | null;
  error: string | null;
  load: (force?: boolean) => Promise<CreatorStylesIndex | null>;
  setRoot: (root: string) => Promise<string | null>;
}

let inflight: Promise<CreatorStylesIndex | null> | null = null;

export const useCreatorStyles = create<StylesState>((set, get) => ({
  status: "idle",
  index: null,
  error: null,
  load: async (force = false) => {
    if (!force && get().status === "ready") return get().index;
    if (inflight) return inflight;
    const base = stylesBase();
    if (!base) {
      set({ status: "unpaired", error: "Pair this browser with OpenReel's local bridge (Settings > MCP) to load your creator styles." });
      return null;
    }
    set({ status: "loading" });
    inflight = (async () => {
      try {
        const res = await fetch(`${base}index.json`, { cache: "no-store" });
        const index = (await res.json()) as CreatorStylesIndex & { error?: string };
        if (!res.ok) throw new Error(index.error ?? `HTTP ${res.status}`);
        set({ status: index.ok ? "ready" : "error", index, error: index.ok ? null : index.error ?? "No styles found" });
        return index;
      } catch (error) {
        set({
          status: "error",
          error: isDesktop()
            ? `Couldn't read the styles: ${error instanceof Error ? error.message : String(error)}`
            : "Couldn't reach the local OpenReel bridge. Is openreel-mcp running? (run `openreel-mcp pair`)",
        });
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  setRoot: async (root) => {
    const base = stylesBase();
    if (!base) return "Pair this browser first (Settings > MCP)";
    try {
      const res = await fetch(`${base}config`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ root }) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) return body.error ?? `HTTP ${res.status}`;
      await get().load(true);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  },
}));

/** Search + filter, used by the gallery and list_creator_styles. */
export function filterStyles(
  styles: readonly CreatorStyle[],
  { query = "", kind = "", tag = "" }: { query?: string; kind?: string; tag?: string },
): CreatorStyle[] {
  const q = query.trim().toLowerCase();
  return styles.filter((s) => {
    if (kind && s.kind !== kind) return false;
    if (tag && !(s.tags ?? []).includes(tag)) return false;
    if (!q) return true;
    const hay = [s.id, s.name, s.blurb, s.cues, ...(s.tags ?? []), ...(s.aliases ?? []), ...Object.values(s.lends ?? {})]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}
