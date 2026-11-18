// DLT Cafe addition: import a local file into the open project via the desktop
// main process (window.openreel.media.readLocalFile). Path checks (approved
// folders, extensions, size cap) are enforced in main, not here.
import type { ImportedMediaRef } from "@openreel/agent";
import { useProjectStore } from "../../../stores/project-store";

const CHUNK_BYTES = 32 * 1024 * 1024;

type LocalFileBridge = NonNullable<
  NonNullable<NonNullable<Window["openreel"]>["media"]>["readLocalFile"]
>;

/** Pull a file from main in chunks and build a File (Blob parts can page to disk). */
export async function readLocalMediaFile(
  bridge: LocalFileBridge,
  filePath: string,
  options?: { name?: string },
): Promise<File> {
  const opened = await bridge.open({ path: filePath });
  if (!opened.ok) {
    throw new Error(opened.error ?? `Could not open ${filePath}`);
  }
  try {
    const parts: Blob[] = [];
    let offset = 0;
    while (offset < opened.size) {
      const chunk = await bridge.read({
        handle: opened.handle,
        offset,
        length: Math.min(CHUNK_BYTES, opened.size - offset),
      });
      if (chunk.byteLength === 0) {
        throw new Error(`Unexpected end of file at ${offset} of ${opened.size} bytes`);
      }
      parts.push(new Blob([chunk]));
      offset += chunk.byteLength;
    }
    return new File(parts, options?.name ?? opened.name, { type: opened.contentType });
  } finally {
    await bridge.close({ handle: opened.handle }).catch(() => undefined);
  }
}

export async function importLocalMediaFile(
  filePath: string,
  options?: { name?: string },
): Promise<ImportedMediaRef> {
  const bridge = window.openreel?.media?.readLocalFile;
  if (!bridge) {
    throw new Error("Local file import is only available in the desktop app");
  }
  const file = await readLocalMediaFile(bridge, filePath, options);
  const result = await useProjectStore.getState().importMedia(file);
  if (!result.success || !result.actionId) {
    throw new Error(result.error?.message ?? "Media import failed");
  }
  const mediaId = result.actionId;
  const item = useProjectStore
    .getState()
    .project.mediaLibrary.items.find((m) => m.id === mediaId);
  return {
    mediaId,
    name: file.name,
    type: item?.type ?? "unknown",
    durationSec: item?.metadata?.duration ?? 0,
    width: item?.metadata?.width,
    height: item?.metadata?.height,
  };
}
