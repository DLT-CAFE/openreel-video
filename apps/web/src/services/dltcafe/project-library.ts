// DLT Cafe: the home screen's project library. Projects are OpenReel's auto-save
// records (IndexedDB, same in the browser and the desktop app). On top of them:
// archive and "recently deleted" flags (kept in localStorage, so nothing is lost
// by archiving or trashing), rename, duplicate, permanent delete (from the trash
// only, after a confirmation), and small thumbnails captured when leaving a project.
import type { Project } from "@openreel/core";
import { autoSaveManager } from "../auto-save";
import { useProjectStore } from "../../stores/project-store";

export type ProjectFormat = "vertical" | "horizontal" | "square" | "other";

export interface LibraryProject {
  readonly projectId: string;
  readonly saveId: string;
  readonly name: string;
  readonly modifiedAt: number;
  readonly createdAt?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fps?: number;
  readonly format: ProjectFormat;
  readonly durationSec: number;
  readonly clipCount: number;
  readonly mediaCount: number;
  readonly thumbnail?: string;
  readonly archivedAt?: number;
  readonly trashedAt?: number;
  /** Set when the project was made from a creator style (review context). */
  readonly styleId?: string;
}

const FLAGS_KEY = "dltcafe-project-library";
const THUMBS_KEY = "dltcafe-project-thumbs";
const MAX_THUMBS = 80;

interface Flags {
  archived: Record<string, number>;
  trashed: Record<string, number>;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: flags last for this session only
  }
}

export const readFlags = (): Flags => readJson<Flags>(FLAGS_KEY, { archived: {}, trashed: {} });
const writeFlags = (f: Flags) => writeJson(FLAGS_KEY, f);
const readThumbs = (): Record<string, { url: string; at: number }> => readJson(THUMBS_KEY, {});

export function formatOf(width?: number, height?: number): ProjectFormat {
  if (!width || !height) return "other";
  const r = width / height;
  if (Math.abs(r - 1) < 0.05) return "square";
  return r < 1 ? "vertical" : "horizontal";
}

function summarize(project: Project | null) {
  if (!project) return { durationSec: 0, clipCount: 0, mediaCount: 0 };
  let end = 0;
  let clips = 0;
  for (const track of project.timeline?.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      clips += 1;
      end = Math.max(end, (clip.startTime ?? 0) + (clip.duration ?? 0));
    }
  }
  const items = project.mediaLibrary?.items ?? [];
  const dataThumb = items.find((m) => typeof m.thumbnailUrl === "string" && m.thumbnailUrl.startsWith("data:image"))?.thumbnailUrl ?? undefined;
  const styleId = (project as Project & { review?: { context?: { styleId?: string } } }).review?.context?.styleId;
  return { durationSec: end || project.timeline?.duration || 0, clipCount: clips, mediaCount: items.length, dataThumb, styleId };
}

export async function loadLibrary(): Promise<LibraryProject[]> {
  const flags = readFlags();
  const thumbs = readThumbs();
  const rows = await autoSaveManager.listLatestProjects();
  return rows.map(({ meta, project }) => {
    const s = project?.settings;
    const sum = summarize(project);
    return {
      projectId: meta.projectId,
      saveId: meta.id,
      name: meta.projectName || project?.name || "Untitled",
      modifiedAt: meta.timestamp,
      ...(project?.createdAt ? { createdAt: project.createdAt } : {}),
      ...(s ? { width: s.width, height: s.height, fps: s.frameRate } : {}),
      format: formatOf(s?.width, s?.height),
      durationSec: sum.durationSec,
      clipCount: sum.clipCount,
      mediaCount: sum.mediaCount,
      ...(thumbs[meta.projectId]?.url ? { thumbnail: thumbs[meta.projectId].url } : sum.dataThumb ? { thumbnail: sum.dataThumb } : {}),
      ...(flags.archived[meta.projectId] ? { archivedAt: flags.archived[meta.projectId] } : {}),
      ...(flags.trashed[meta.projectId] ? { trashedAt: flags.trashed[meta.projectId] } : {}),
      ...(sum.styleId ? { styleId: sum.styleId } : {}),
    };
  });
}

function setFlag(kind: keyof Flags, ids: readonly string[], on: boolean): void {
  const f = readFlags();
  const now = Date.now();
  for (const id of ids) {
    if (on) f[kind][id] = now;
    else delete f[kind][id];
  }
  writeFlags(f);
}

export const archiveProjects = (ids: readonly string[]) => setFlag("archived", ids, true);
export const unarchiveProjects = (ids: readonly string[]) => setFlag("archived", ids, false);
/** Moves to "Recently deleted". Nothing is removed until deleteProjectsForever. */
export const trashProjects = (ids: readonly string[]) => setFlag("trashed", ids, true);
export const restoreProjects = (ids: readonly string[]) => setFlag("trashed", ids, false);

/** Permanent: removes the saves. Only offered from "Recently deleted", after a confirmation. */
export async function deleteProjectsForever(ids: readonly string[]): Promise<void> {
  const open = useProjectStore.getState();
  for (const id of ids) {
    if (open.hasOpenProject && open.project.id === id) continue; // never the project that is open
    await autoSaveManager.deleteProjectSaves(id);
    const f = readFlags();
    delete f.trashed[id];
    delete f.archived[id];
    writeFlags(f);
    const t = readThumbs();
    delete t[id];
    writeJson(THUMBS_KEY, t);
  }
}

export async function renameLibraryProject(projectId: string, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) return;
  const store = useProjectStore.getState();
  if (store.hasOpenProject && store.project.id === projectId) await store.renameProject(clean);
  await autoSaveManager.renameProjectSaves(projectId, clean);
}

export async function duplicateLibraryProject(projectId: string, name: string): Promise<string | null> {
  const newId = globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}`;
  const id = await autoSaveManager.duplicateProjectSave(projectId, name, newId);
  const t = readThumbs();
  if (id && t[projectId]) {
    t[id] = { ...t[projectId], at: Date.now() };
    writeJson(THUMBS_KEY, t);
  }
  return id;
}

/** Keeps a small picture of the viewer for the project card (called when leaving a project). */
export function captureProjectThumbnail(projectId: string): void {
  try {
    const canvas = document.querySelector<HTMLCanvasElement>('[aria-label="Preview canvas"] canvas');
    if (!canvas || !canvas.width || !canvas.height) return;
    const w = 320;
    const h = Math.round((canvas.height / canvas.width) * w);
    const small = document.createElement("canvas");
    small.width = w;
    small.height = h;
    const ctx = small.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvas, 0, 0, w, h);
    // An all-black frame (nothing on the timeline, or a WebGPU canvas we can't read) isn't worth keeping.
    const px = ctx.getImageData(0, 0, w, h).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 64) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
    if (lit < 20) return;
    const url = small.toDataURL("image/jpeg", 0.72);
    const t = readThumbs();
    t[projectId] = { url, at: Date.now() };
    const keep = Object.entries(t).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_THUMBS);
    writeJson(THUMBS_KEY, Object.fromEntries(keep));
  } catch {
    // tainted or unreadable canvas: no thumbnail
  }
}

export function formatDuration(sec: number): string {
  if (!sec) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  const min = Math.round(d / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString();
}
