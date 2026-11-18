// DLT Cafe: creator styles (the content creator pack's editing styles) read live
// from a local folder, for OpenReel's style gallery. The pack is licensed content,
// so nothing of it is in the repo: the desktop app (app://openreel/__dltcafe/styles/…)
// and the web bridge hub (http://127.0.0.1:<port>/styles/…) serve it from disk.
//
// Layout of the folder (the pack's skills folder):
//   <root>/editing-styles/studio-catalog/catalog/catalog.json   the catalog (33+ styles)
//   <root>/editing-styles/studio-catalog/app/public/styles/<id>.jpg|.mp4 (+ <id>-<variant>.jpg)
//   <root>/<id>/SKILL.md                                         the style's skill
//   <root>/<id>/examples/placeholder-sample/index.html           live HyperFrames sample (some styles)
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_STYLES_ROOT = path.join(os.homedir(), "DLT-Cafe/03-shared/skills/custom/content-creator-editor/skills");

const CATALOG_REL = "editing-styles/studio-catalog/catalog/catalog.json";
const MEDIA_REL = "editing-styles/studio-catalog/app/public/styles";
/** Live samples that aren't at the usual examples/placeholder-sample/index.html. */
const LIVE_SAMPLE_OVERRIDES: Record<string, string> = { "yap-and-show": "templates/ui-tiles.html" };

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

export function stylesConfigFile(): string {
  const override = process.env.OPENREEL_STYLES_CONFIG;
  return override && override.length > 0 ? override : path.join(os.homedir(), ".openreel", "creator-styles.json");
}

export function readStylesRoot(file = stylesConfigFile()): string {
  if (process.env.OPENREEL_STYLES_ROOT) return process.env.OPENREEL_STYLES_ROOT;
  try {
    const root = (JSON.parse(readFileSync(file, "utf8")) as { root?: string }).root;
    if (root && root.trim()) return root.replace(/^~(?=\/|$)/, os.homedir());
  } catch {
    // default below
  }
  return DEFAULT_STYLES_ROOT;
}

export function isStylesRoot(root: string): boolean {
  return existsSync(path.join(root, CATALOG_REL));
}

/** Saves a new root after checking it holds a catalog. Returns an error message or null. */
export function writeStylesRoot(root: string, file = stylesConfigFile()): string | null {
  const clean = root.trim().replace(/^~(?=\/|$)/, os.homedir());
  if (!path.isAbsolute(clean)) return "Use a full path (starting with / or ~/)";
  if (!isStylesRoot(clean)) return `No style catalog in that folder (expected ${CATALOG_REL})`;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ root: clean }, null, 2));
  return null;
}

export interface StyleMedia {
  readonly poster?: string;
  readonly loop?: string;
  readonly variants: string[];
  /** Path under skills/ for the live HTML sample, e.g. "rapid-list/examples/placeholder-sample/index.html". */
  readonly live?: string;
}

export interface StylesIndex {
  readonly root: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly styles: Array<Record<string, unknown> & { id: string; media: StyleMedia; skillPath?: string; paths: Record<string, string> }>;
  readonly extras: Record<string, unknown>;
}

/** The catalog with what is on disk for each style (preview files, live sample, skill path). Read fresh every time. */
export function buildStylesIndex(root = readStylesRoot()): StylesIndex {
  const catalogFile = path.join(root, CATALOG_REL);
  let catalog: { styles?: Array<Record<string, unknown>> } & Record<string, unknown>;
  try {
    catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
  } catch (error) {
    return { root, ok: false, error: existsSync(catalogFile) ? `Can't read ${catalogFile}: ${String(error)}` : `No style catalog at ${catalogFile}`, styles: [], extras: {} };
  }
  const mediaDir = path.join(root, MEDIA_REL);
  let files: string[] = [];
  try {
    files = readdirSync(mediaDir);
  } catch {
    files = [];
  }
  const fileSet = new Set(files);
  const raw = Array.isArray(catalog.styles) ? catalog.styles : [];
  const ids = new Set(raw.map((s) => String(s.id)));
  const styles = raw
    .filter((s) => typeof s.id === "string" && /^[a-z0-9][a-z0-9-]*$/.test(s.id))
    .map((s) => {
      const id = s.id as string;
      const variants = files.filter(
        (f) => f.startsWith(`${id}-`) && /\.(jpg|jpeg|png|webp|mp4)$/i.test(f) && !ids.has(f.replace(/\.[^.]+$/, "")),
      );
      const liveRel = LIVE_SAMPLE_OVERRIDES[id] ?? "examples/placeholder-sample/index.html";
      const live = existsSync(path.join(root, id, liveRel)) ? `${id}/${liveRel}` : undefined;
      const skill = path.join(root, id, "SKILL.md");
      const media: StyleMedia = {
        ...(fileSet.has(`${id}.jpg`) ? { poster: `${id}.jpg` } : {}),
        ...(fileSet.has(`${id}.mp4`) ? { loop: `${id}.mp4` } : {}),
        variants,
        ...(live ? { live } : {}),
      };
      return {
        ...s,
        id,
        media,
        ...(existsSync(skill) ? { skillPath: skill } : {}),
        paths: {
          ...(media.poster ? { poster: path.join(mediaDir, media.poster) } : {}),
          ...(media.loop ? { loop: path.join(mediaDir, media.loop) } : {}),
          ...(live ? { live: path.join(root, live) } : {}),
        },
      };
    });
  const { styles: _s, ...extras } = catalog;
  return { root, ok: true, styles, extras };
}

/**
 * Maps a request path under the styles prefix to a file on disk, or null.
 *   index.json            -> (built, not a file)
 *   media/<file>          -> <root>/editing-styles/studio-catalog/app/public/styles/<file>
 *   skills/<id>/<rest>    -> <root>/<id>/<rest>   (only for ids in the catalog; for live samples and their assets)
 * Only known media/web file types, never outside those folders, never dotfiles.
 */
export function resolveStyleFile(rel: string, root = readStylesRoot(), knownIds?: ReadonlySet<string>): string | null {
  let clean: string;
  try {
    clean = decodeURIComponent(rel).replace(/^\/+/, "");
  } catch {
    return null;
  }
  if (clean.split("/").some((part) => part === ".." || part.startsWith("."))) return null;
  const ext = path.extname(clean).toLowerCase();
  if (!TYPES[ext]) return null;
  let base: string;
  let sub: string;
  if (clean.startsWith("media/")) {
    base = path.join(root, MEDIA_REL);
    sub = clean.slice("media/".length);
  } else if (clean.startsWith("skills/")) {
    const rest = clean.slice("skills/".length);
    const id = rest.split("/")[0];
    const ids = knownIds ?? new Set(buildStylesIndex(root).styles.map((s) => s.id));
    if (!ids.has(id)) return null;
    base = root;
    sub = rest;
  } else {
    return null;
  }
  const full = path.normalize(path.join(base, sub));
  const relToBase = path.relative(base, full);
  if (relToBase.startsWith("..") || path.isAbsolute(relToBase)) return null;
  try {
    if (!statSync(full).isFile()) return null;
  } catch {
    return null;
  }
  return full;
}

export function contentType(file: string): string {
  return TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}
