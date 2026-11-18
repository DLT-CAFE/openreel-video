// DLT Cafe addition: load an openreel-edit v2 JSON from an approved local folder
// and relink its media by file name + size from a media folder, importing each
// file once through the approved-folder reader (same path as
// import_media_from_path). Replaces the current timeline as one undo step.
//
// A ref of type "audio" whose file decodes as video (pr-handoff writes these for
// video files used on audio tracks) gets its audio separated with OpenReel's
// own Separate Audio service, so audio tracks hold audio-only media.
import type { MediaItem, Project } from "@openreel/core";
import {
  materializePortableEdit,
  parsePortableEdit,
  type PortableEdit,
} from "@openreel/core/editing/portable-project";
import { useProjectStore } from "../../../stores/project-store";
import { saveMediaBlob, deleteMediaBlob } from "../../media-storage";
import { extractAudioTracks } from "../../separate-audio";
import { EditingSession } from "../editing-session";
import { importLocalMediaFile } from "./local-media-import";

/** Clips may end this far past the decoded media end before import fails (s). */
const CLAMP_TOLERANCE_SEC = 0.25;

export interface PortableImportReport {
  readonly projectName: string;
  readonly tracks: number;
  readonly clips: number;
  readonly mediaRefs: number;
  readonly linked: number;
  readonly filesImported: number;
  readonly filesReused: number;
  readonly audioSeparated: number;
  readonly clampedClips: number;
  readonly durationSec: number;
  readonly missing: readonly { readonly id: string; readonly name: string; readonly reason: string }[];
}

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

/** Resolve mediaDir against the JSON's folder. Main re-checks the final path. */
export function resolveMediaDir(jsonPath: string, mediaDir?: string): string {
  const base = dirname(jsonPath);
  if (!mediaDir || mediaDir.trim() === "") return base;
  const dir = mediaDir.trim().replace(/\/+$/, "");
  if (dir.startsWith("/") || dir === "~" || dir.startsWith("~/")) return dir;
  return `${base}/${dir}`;
}

function fileKey(name: string, size: number): string {
  return `${name}\u0000${size}`;
}

function findExisting(items: readonly MediaItem[], name: string, size: number): MediaItem | undefined {
  return items.find(
    (m) => m.blob && m.sourceFile?.name === name && m.sourceFile.size === size && !m.isPlaceholder,
  );
}

/** Rewrite media ids (and clip references) to the resolved library ids. */
export function remapMediaIds(doc: PortableEdit, idMap: ReadonlyMap<string, string>): PortableEdit {
  const map = (id: string) => idMap.get(id) ?? id;
  return {
    ...doc,
    project: {
      ...doc.project,
      media: doc.project.media.map((m) => ({ ...m, id: map(m.id) })),
      timeline: {
        ...doc.project.timeline,
        tracks: doc.project.timeline.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => ({ ...c, mediaId: map(c.mediaId) })),
        })),
      },
    },
  };
}

/**
 * Trim clips that overrun the decoded media by a hair (container vs decoder
 * duration). Larger overruns are left alone so validation reports them.
 */
export function clampToDecodedDurations(
  doc: PortableEdit,
  durations: ReadonlyMap<string, number>,
): { doc: PortableEdit; clamped: number } {
  let clamped = 0;
  const tracks = doc.project.timeline.tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => {
      const d = durations.get(c.mediaId);
      if (d === undefined || d <= 0 || c.outPoint <= d + 0.05) return c;
      if (c.outPoint - d > CLAMP_TOLERANCE_SEC || d <= c.inPoint) return c;
      clamped++;
      const speed = c.speed ?? 1;
      return { ...c, outPoint: d, duration: (d - c.inPoint) / speed };
    }),
  }));
  return { doc: { ...doc, project: { ...doc.project, timeline: { ...doc.project.timeline, tracks } } }, clamped };
}

export async function importPortableEditFromPath(
  jsonPath: string,
  options?: { mediaDir?: string },
): Promise<PortableImportReport> {
  const bridge = window.openreel?.media?.readLocalFile;
  if (!bridge) throw new Error("Portable edit import from a path is only available in the desktop app");
  if (!useProjectStore.getState().hasOpenProject) throw new Error("No project is open");

  const read = await bridge.readEditJson({ path: jsonPath });
  if (!read.ok) throw new Error(read.error ?? `Could not read ${jsonPath}`);
  const doc = parsePortableEdit(read.text);
  const mediaDir = resolveMediaDir(read.path, options?.mediaDir);

  const missing: { id: string; name: string; reason: string }[] = [];
  const idMap = new Map<string, string>();
  const durations = new Map<string, number>();
  const extraItems: MediaItem[] = [];
  const importedIds = new Set<string>();
  const baseByFile = new Map<string, MediaItem | Error>();
  const separatedByFile = new Map<string, MediaItem | Error>();
  let filesImported = 0;
  let filesReused = 0;

  const resolveFile = async (name: string, size: number): Promise<MediaItem> => {
    const key = fileKey(name, size);
    const cached = baseByFile.get(key);
    if (cached instanceof Error) throw cached;
    if (cached) return cached;
    try {
      let item = findExisting(useProjectStore.getState().project.mediaLibrary.items, name, size);
      if (item) {
        filesReused++;
      } else {
        const ref = await importLocalMediaFile(`${mediaDir}/${name}`, { expectedSize: size });
        item = useProjectStore.getState().project.mediaLibrary.items.find((m) => m.id === ref.mediaId);
        if (!item) throw new Error("Imported media did not appear in the library");
        importedIds.add(item.id);
        filesImported++;
      }
      baseByFile.set(key, item);
      return item;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      baseByFile.set(key, err);
      throw err;
    }
  };

  const separated = async (key: string, video: MediaItem, projectId: string): Promise<MediaItem> => {
    const cached = separatedByFile.get(key);
    if (cached instanceof Error) throw cached;
    if (cached) return cached;
    try {
      const [audio] = await extractAudioTracks(video);
      if (!audio) throw new Error("No audio stream to separate");
      await saveMediaBlob(projectId, audio.id, audio.blob!, audio.metadata);
      extraItems.push(audio);
      separatedByFile.set(key, audio);
      return audio;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      separatedByFile.set(key, err);
      throw err;
    }
  };

  const projectId = useProjectStore.getState().project.id;
  // Base files first, sequentially, to bound decoder memory.
  for (const ref of doc.project.media) {
    const name = ref.sourceFile?.name ?? ref.name;
    const size = ref.sourceFile?.size ?? ref.metadata.fileSize;
    try {
      const base = await resolveFile(name, size);
      let target = base;
      if (ref.type !== base.type) {
        if (ref.type === "audio" && base.type === "video") {
          target = await separated(fileKey(name, size), base, projectId);
        } else {
          throw new Error(`Expected ${ref.type}, file decodes as ${base.type}`);
        }
      }
      idMap.set(ref.id, target.id);
      durations.set(target.id, target.metadata.duration);
    } catch (error) {
      missing.push({ id: ref.id, name, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const remapped = remapMediaIds(doc, idMap);
  const { doc: fitted, clamped } = clampToDecodedDurations(remapped, durations);

  const session = new EditingSession();
  const txn = session.beginTransaction();
  const current: Project = session.getProject();
  const withExtras: Project = {
    ...current,
    mediaLibrary: { items: [...current.mediaLibrary.items, ...extraItems] },
  };
  const restored = materializePortableEdit(fitted, withExtras);
  session.replaceDraft(restored.project);
  await session.commitTransaction(txn, "Import portable edit");

  // Media imported only to separate its audio is no longer referenced: drop its stored copy.
  const kept = new Set(restored.project.mediaLibrary.items.map((m) => m.id));
  for (const id of importedIds) {
    if (!kept.has(id)) await deleteMediaBlob(id).catch(() => undefined);
  }

  const tracks = restored.project.timeline.tracks;
  return {
    projectName: restored.project.name,
    tracks: tracks.length,
    clips: tracks.reduce((n, t) => n + t.clips.length, 0),
    mediaRefs: doc.project.media.length,
    linked: doc.project.media.length - restored.missing.length,
    filesImported,
    filesReused,
    audioSeparated: extraItems.length,
    clampedClips: clamped,
    durationSec: restored.project.timeline.duration,
    missing: [
      ...missing,
      ...restored.missing
        .filter((id) => !missing.some((m) => idMap.get(m.id) === id || m.id === id))
        .map((id) => ({ id, name: doc.project.media.find((m) => m.id === id)?.name ?? id, reason: "not linked" })),
    ],
  };
}
