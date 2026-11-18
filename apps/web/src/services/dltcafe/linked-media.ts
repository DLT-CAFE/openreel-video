// DLT Cafe: link big media files instead of copying them into IndexedDB.
//
// When a file is at least LINK_THRESHOLD bytes and we hold a
// FileSystemFileHandle for it (drag-and-drop, folder import or the Import
// button's file picker in Chromium), the bytes stay on disk: only the handle
// (already saved by name + size) is kept. After a reload the item opens as a
// placeholder and OpenReel's existing handle restore reads it back. If the
// browser needs the person's OK again (permission "prompt"), the Media panel
// shows a "Re-allow access" banner (see LinkedMediaBanner).
// Browsers without File System Access (Firefox, Safari) keep copying.
import type { MediaItem, MediaMetadata } from "@openreel/core";
import { loadFileHandle, saveFileHandle, saveMediaBlob } from "../media-storage";

export const DEFAULT_LINK_THRESHOLD_BYTES = 200 * 1024 * 1024;
const THRESHOLD_KEY = "dltcafe-link-threshold-mb";

/** Threshold in bytes; override with localStorage "dltcafe-link-threshold-mb" (0 = always copy). */
export function linkThresholdBytes(): number {
  try {
    const raw = localStorage.getItem(THRESHOLD_KEY);
    if (raw !== null && raw.trim() !== "") {
      const mb = Number(raw);
      if (Number.isFinite(mb) && mb >= 0) return mb === 0 ? Infinity : mb * 1024 * 1024;
    }
  } catch { /* storage unavailable */ }
  return DEFAULT_LINK_THRESHOLD_BYTES;
}

export function supportsFileHandles(): boolean {
  return typeof window !== "undefined" && "FileSystemFileHandle" in window;
}

export async function shouldLink(file: File, threshold = linkThresholdBytes()): Promise<boolean> {
  if (file.size < threshold || !supportsFileHandles()) return false;
  try {
    return !!(await loadFileHandle(file.name, file.size));
  } catch {
    return false;
  }
}

/**
 * Drop-in for saveMediaBlob in the media slice: copies small files (and every
 * file where handles aren't available), links big files we hold a handle for.
 */
export async function persistMediaOrLink(
  projectId: string,
  mediaId: string,
  file: File,
  metadata: MediaMetadata,
): Promise<"copied" | "linked"> {
  if (await shouldLink(file)) return "linked";
  await saveMediaBlob(projectId, mediaId, file, metadata);
  return "copied";
}

type PermissionHandle = FileSystemFileHandle & {
  queryPermission?(o: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(o: { mode: "read" }): Promise<PermissionState>;
};

export async function handlePermission(handle: FileSystemFileHandle): Promise<PermissionState> {
  const h = handle as PermissionHandle;
  if (typeof h.queryPermission !== "function") return "granted";
  try {
    return await h.queryPermission({ mode: "read" });
  } catch {
    return "denied";
  }
}

export interface LinkedNeedingAccess {
  readonly item: MediaItem;
  readonly handle: FileSystemFileHandle;
}

export interface LinkedPlaceholders {
  /** Readable now: relink without asking. */
  readonly ready: LinkedNeedingAccess[];
  /** The browser needs the person's OK (a click) first. */
  readonly needAccess: LinkedNeedingAccess[];
}

/** Placeholder media that has a saved file handle, split by permission state. */
export async function findLinkedPlaceholders(items: readonly MediaItem[]): Promise<LinkedPlaceholders> {
  const ready: LinkedNeedingAccess[] = [];
  const needAccess: LinkedNeedingAccess[] = [];
  if (!supportsFileHandles()) return { ready, needAccess };
  for (const item of items) {
    if (!item.isPlaceholder || !item.sourceFile) continue;
    try {
      const handle = await loadFileHandle(item.sourceFile.name, item.sourceFile.size);
      if (!handle) continue;
      const state = await handlePermission(handle);
      if (state === "granted") ready.push({ item, handle });
      else if (state === "prompt") needAccess.push({ item, handle });
    } catch { /* stale handle */ }
  }
  return { ready, needAccess };
}

/** Placeholders whose saved handle needs the person's OK before it can be read. */
export async function findLinkedNeedingAccess(items: readonly MediaItem[]): Promise<LinkedNeedingAccess[]> {
  return (await findLinkedPlaceholders(items)).needAccess;
}

/**
 * Ask for read access (must start inside a click) and relink each item.
 * Returns how many were relinked.
 */
export async function regainAccess(
  needs: readonly LinkedNeedingAccess[],
  relink: (mediaId: string, file: File) => Promise<unknown>,
): Promise<{ relinked: number; denied: number }> {
  let relinked = 0;
  let denied = 0;
  for (const { item, handle } of needs) {
    const h = handle as PermissionHandle;
    try {
      const state = typeof h.requestPermission === "function" ? await h.requestPermission({ mode: "read" }) : "granted";
      if (state !== "granted") { denied++; continue; }
      const file = await handle.getFile();
      await relink(item.id, file);
      relinked++;
    } catch {
      denied++;
    }
  }
  return { relinked, denied };
}

const MEDIA_PICKER_TYPES = [
  {
    description: "Video, audio and images",
    accept: {
      "video/*": [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mxf", ".mts"],
      "audio/*": [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".aif", ".aiff"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".avif", ".svg"],
    },
  },
];

export function supportsOpenFilePicker(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * Chromium file picker that also returns handles (saved for linking and
 * relinking). Returns null when unsupported or cancelled.
 */
export async function pickMediaFilesWithHandles(): Promise<File[] | null> {
  if (!supportsOpenFilePicker()) return null;
  let handles: FileSystemFileHandle[];
  try {
    handles = await (window as unknown as {
      showOpenFilePicker(o: unknown): Promise<FileSystemFileHandle[]>;
    }).showOpenFilePicker({ multiple: true, types: MEDIA_PICKER_TYPES, excludeAcceptAllOption: false });
  } catch {
    return [];
  }
  const files: File[] = [];
  for (const handle of handles) {
    const file = await handle.getFile();
    try { await saveFileHandle(file.name, file.size, handle); } catch { /* best-effort */ }
    files.push(file);
  }
  return files;
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.round(n / 1024)} KB`;
}
