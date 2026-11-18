// DLT Cafe: collect media files from a folder (recursively) for import.
// Chrome/Edge: File System Access folder picker (keeps a handle per file,
// used for relinking / linking big files). Other browsers: an
// <input webkitdirectory> fallback. Desktop (Electron/Chromium) uses the picker.

export const MEDIA_EXTENSIONS: ReadonlySet<string> = new Set([
  // video
  "mp4", "mov", "m4v", "webm", "mkv", "avi", "mxf", "mts", "m2ts", "3gp", "ogv",
  // audio
  "wav", "mp3", "m4a", "aac", "flac", "ogg", "oga", "opus", "aif", "aiff", "wma",
  // image
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "heic", "heif", "avif", "svg",
]);

/** Most files a single folder import will take; the rest are reported as skipped. */
export const FOLDER_IMPORT_MAX_FILES = 500;

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/** Hidden files/folders, macOS resource forks and NLE cache folders are skipped. */
export function isSkippedSegment(segment: string): boolean {
  if (!segment || segment.startsWith(".") || segment.startsWith("._")) return true;
  if (segment === "__MACOSX" || segment === "node_modules") return true;
  return /^(Adobe Premiere Pro (Audio|Video) Previews|Adobe Premiere Pro Auto-Save|Media Cache( Files)?|CacheClip|\.?RenderFiles)$/i.test(segment);
}

export function isMediaFileName(name: string): boolean {
  return !isSkippedSegment(name) && MEDIA_EXTENSIONS.has(extensionOf(name));
}

export interface FolderEntry {
  readonly file: File;
  /** Path inside the picked folder, e.g. "day1/cam A/clip.mov". */
  readonly relativePath: string;
  readonly handle?: FileSystemFileHandle;
}

export interface FolderScan {
  readonly folderName: string;
  readonly entries: FolderEntry[];
  /** Files seen that aren't media (or were in skipped folders). */
  readonly skippedNonMedia: number;
  /** Media files over FOLDER_IMPORT_MAX_FILES. */
  readonly skippedOverLimit: number;
}

function finish(folderName: string, entries: FolderEntry[], skippedNonMedia: number, max: number): FolderScan {
  const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { numeric: true }));
  return {
    folderName,
    entries: sorted.slice(0, max),
    skippedNonMedia,
    skippedOverLimit: Math.max(0, sorted.length - max),
  };
}

/** For <input webkitdirectory>: File.webkitRelativePath is "Folder/sub/file.ext". */
export function scanInputFiles(files: ArrayLike<File>, max = FOLDER_IMPORT_MAX_FILES): FolderScan {
  const entries: FolderEntry[] = [];
  let skipped = 0;
  let folderName = "";
  for (const file of Array.from(files)) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = rel.split("/");
    if (!folderName && parts.length > 1) folderName = parts[0];
    const inner = parts.length > 1 ? parts.slice(1) : parts;
    if (inner.some((p, i) => i < inner.length - 1 && isSkippedSegment(p)) || !isMediaFileName(inner[inner.length - 1])) {
      skipped++;
      continue;
    }
    entries.push({ file, relativePath: inner.join("/") });
  }
  return finish(folderName, entries, skipped, max);
}

type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};

/** Walk a File System Access directory handle recursively. */
export async function scanDirectoryHandle(
  dir: FileSystemDirectoryHandle,
  max = FOLDER_IMPORT_MAX_FILES,
  onProgress?: (found: number) => void,
): Promise<FolderScan> {
  const entries: FolderEntry[] = [];
  let skipped = 0;
  // Collect a few past the limit so "skipped over limit" is meaningful but bounded.
  const hardStop = max + 1000;
  const walk = async (d: DirHandle, prefix: string): Promise<void> => {
    for await (const handle of d.values()) {
      if (entries.length >= hardStop) return;
      if (handle.kind === "directory") {
        if (isSkippedSegment(handle.name)) continue;
        await walk(handle as DirHandle, `${prefix}${handle.name}/`);
      } else if (isMediaFileName(handle.name)) {
        const fh = handle as FileSystemFileHandle;
        entries.push({ file: await fh.getFile(), relativePath: `${prefix}${handle.name}`, handle: fh });
        onProgress?.(entries.length);
      } else {
        skipped++;
      }
    }
  };
  await walk(dir as DirHandle, "");
  return finish(dir.name, entries, skipped, max);
}

export function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export function summarizeScan(scan: FolderScan, imported: number, failed: number): string {
  const parts = [`Imported ${imported} file${imported === 1 ? "" : "s"} from “${scan.folderName || "folder"}”`];
  if (failed) parts.push(`${failed} failed`);
  if (scan.skippedNonMedia) parts.push(`${scan.skippedNonMedia} other file${scan.skippedNonMedia === 1 ? "" : "s"} skipped (not media, hidden or cache)`);
  if (scan.skippedOverLimit) parts.push(`${scan.skippedOverLimit} over the ${FOLDER_IMPORT_MAX_FILES}-file limit skipped`);
  return parts.join(" · ");
}
