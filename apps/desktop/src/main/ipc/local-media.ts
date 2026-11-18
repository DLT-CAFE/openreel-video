// DLT Cafe addition: read local media files for the `import_media_from_path`
// MCP tool. Kept in its own module so upstream merges stay clean.
//
// Security model
// - Only files inside approved roots can be read. Default root: ~/DLT-Cafe.
//   Override with OPENREEL_MEDIA_ROOTS (colon-separated; "~" is expanded).
// - The target and every root are realpath'd, then checked with path.relative,
//   so ".." segments and symlinks can't escape a root.
// - Only media extensions are allowed (checked on the resolved file).
// - Size cap: 4 GB by default. A caller may lower it, never raise it.
// - The file is opened once and then checked again by device/inode, so a swap
//   between the check and the open is caught. Reads go through that open
//   handle only.
//
// Why chunks instead of one buffer like fetch-url: Node's fs.readFile refuses
// files over 2 GiB, and pushing a multi-GB ArrayBuffer through one IPC call
// copies it whole in both processes. The renderer opens a handle, pulls
// <=64 MB chunks and builds a Blob, which Chromium can page to disk.

import { promises as fs, constants as fsConstants } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

export const LOCAL_MEDIA_MIME: Readonly<Record<string, string>> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mkv: "video/x-matroska",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  ogg: "audio/ogg",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const DEFAULT_LOCAL_MEDIA_MAX_BYTES = 4 * 1024 * 1024 * 1024;
export const LOCAL_MEDIA_MAX_CHUNK_BYTES = 64 * 1024 * 1024;
const HANDLE_IDLE_MS = 10 * 60 * 1000;
const MAX_OPEN_HANDLES = 8;

/** Same fields as FetchUrlResult minus `body`, plus file info and a read handle. */
export interface LocalMediaOpenResult {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly contentType: string;
  readonly error?: string;
  readonly name: string;
  readonly size: number;
  readonly handle: string;
}

export interface LocalMediaOptions {
  /** Unresolved roots; defaults to OPENREEL_MEDIA_ROOTS or ~/DLT-Cafe. */
  readonly roots?: readonly string[];
  readonly home?: string;
}

export type LocalMediaCheck =
  | { readonly ok: true; readonly realPath: string; readonly size: number; readonly ext: string }
  | { readonly ok: false; readonly error: string };

export function expandHome(p: string, home: string = os.homedir()): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

export function configuredRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string[] {
  const raw = env.OPENREEL_MEDIA_ROOTS;
  const list = raw && raw.trim().length > 0 ? raw.split(":") : ["~/DLT-Cafe"];
  return list.map((r) => r.trim()).filter((r) => r.length > 0).map((r) => expandHome(r, home));
}

/** Realpath each absolute root; roots that don't exist are dropped. */
export async function resolveRoots(roots: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const root of roots) {
    if (!path.isAbsolute(root)) continue;
    try {
      out.push(await fs.realpath(root));
    } catch {
      // missing root: ignore
    }
  }
  return out;
}

export function isInsideRoot(target: string, root: string): boolean {
  const rel = path.relative(root, target);
  if (rel === "") return false; // the root itself is a directory, not a file
  return !(rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel));
}

function fail(error: string): LocalMediaCheck {
  return { ok: false, error };
}

/** Pure-ish validation (touches the filesystem only via realpath/stat). */
export async function checkLocalMediaPath(
  args: { path: string; maxBytes?: number },
  options: LocalMediaOptions = {},
): Promise<LocalMediaCheck> {
  const home = options.home ?? os.homedir();
  const requested = expandHome(args.path.trim(), home);
  if (!path.isAbsolute(requested)) {
    return fail("Path must be absolute (or start with ~/)");
  }
  const roots = await resolveRoots(options.roots ?? configuredRoots(process.env, home));
  if (roots.length === 0) return fail("No approved media folders are configured");

  let realPath: string;
  try {
    realPath = await fs.realpath(requested);
  } catch {
    // Don't reveal whether files exist outside the approved folders.
    const lexical = path.resolve(requested);
    return roots.some((root) => isInsideRoot(lexical, root))
      ? fail(`File not found: ${requested}`)
      : fail(`Path is outside the approved media folders (${roots.join(", ")})`);
  }
  if (!roots.some((root) => isInsideRoot(realPath, root))) {
    return fail(`Path is outside the approved media folders (${roots.join(", ")})`);
  }
  const ext = path.extname(realPath).slice(1).toLowerCase();
  if (!(ext in LOCAL_MEDIA_MIME)) {
    return fail(`Not an allowed media type: .${ext || "(none)"}`);
  }
  const stat = await fs.stat(realPath);
  if (!stat.isFile()) return fail("Not a regular file");
  const cap = Math.min(args.maxBytes ?? DEFAULT_LOCAL_MEDIA_MAX_BYTES, DEFAULT_LOCAL_MEDIA_MAX_BYTES);
  if (stat.size > cap) {
    return fail(`File too large: ${stat.size} bytes (max ${cap})`);
  }
  return { ok: true, realPath, size: stat.size, ext };
}

interface OpenEntry {
  readonly fh: FileHandle;
  readonly size: number;
  timer: NodeJS.Timeout;
}

export class LocalMediaReader {
  private entries = new Map<string, OpenEntry>();

  constructor(private readonly options: LocalMediaOptions = {}) {}

  async open(args: { path: string; maxBytes?: number }): Promise<LocalMediaOpenResult> {
    const check = await checkLocalMediaPath(args, this.options);
    if (!check.ok) return errorResult(check.error);
    if (this.entries.size >= MAX_OPEN_HANDLES) {
      return errorResult("Too many local media files open; try again shortly");
    }
    let fh: FileHandle;
    try {
      fh = await fs.open(check.realPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Open failed");
    }
    // Make sure the file we opened is the one we checked.
    const [opened, checked] = await Promise.all([fh.stat(), fs.stat(check.realPath)]);
    if (opened.ino !== checked.ino || opened.dev !== checked.dev || !opened.isFile() || opened.size !== check.size) {
      await fh.close();
      return errorResult("File changed while opening; try again");
    }
    const handle = randomUUID();
    this.entries.set(handle, { fh, size: opened.size, timer: this.idleTimer(handle) });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: LOCAL_MEDIA_MIME[check.ext] ?? "application/octet-stream",
      name: path.basename(check.realPath),
      size: opened.size,
      handle,
    };
  }

  async read(args: { handle: string; offset: number; length: number }): Promise<ArrayBuffer> {
    const entry = this.entries.get(args.handle);
    if (!entry) throw new Error("Unknown or expired local media handle");
    clearTimeout(entry.timer);
    entry.timer = this.idleTimer(args.handle);
    if (args.offset < 0 || args.offset > entry.size) throw new Error("Offset out of range");
    const length = Math.min(args.length, LOCAL_MEDIA_MAX_CHUNK_BYTES, entry.size - args.offset);
    if (length <= 0) return new ArrayBuffer(0);
    const buf = Buffer.alloc(length);
    const { bytesRead } = await entry.fh.read(buf, 0, length, args.offset);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead) as ArrayBuffer;
  }

  async close(args: { handle: string }): Promise<void> {
    const entry = this.entries.get(args.handle);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.entries.delete(args.handle);
    await entry.fh.close();
  }

  private idleTimer(handle: string): NodeJS.Timeout {
    const t = setTimeout(() => void this.close({ handle }), HANDLE_IDLE_MS);
    t.unref?.();
    return t;
  }
}

function errorResult(message: string): LocalMediaOpenResult {
  return {
    ok: false,
    status: 0,
    statusText: message,
    contentType: "",
    error: message,
    name: "",
    size: 0,
    handle: "",
  };
}

export const localMediaReader = new LocalMediaReader();
