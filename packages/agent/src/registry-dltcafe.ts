// DLT Cafe tool additions. Kept apart from registry.ts so upstream merges stay
// clean; registry.ts merges DLTCAFE_TOOLS into REGISTRY.
//
// Type-only imports from ./registry: a runtime import would create an
// evaluation cycle (registry.ts imports this file before its helpers exist).
import type { RegisteredTool } from "./registry";
import type { JSONSchema, ToolResult } from "./types";

const str: JSONSchema = { type: "string" };
const obj = (properties: Record<string, JSONSchema>, required: string[] = []): JSONSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: true,
});
const ok = (summary: string, data?: unknown): ToolResult => ({ ok: true, summary, data });
const fail = (message: string, code = "ERROR"): ToolResult => ({
  ok: false,
  summary: message,
  error: { code, message },
});

export const DLTCAFE_TOOLS: RegisteredTool[] = [
  {
    name: "import_media_from_path",
    domain: "media",
    title: "Import media from local path",
    description:
      "Import a local video, audio, or image file into the media library (desktop app only). The path must be absolute (or start with ~/) and sit inside an approved folder (default ~/DLT-Cafe; set OPENREEL_MEDIA_ROOTS to change). Allowed: mp4, mov, m4v, webm, mkv, wav, mp3, m4a, aac, flac, ogg, png, jpg, jpeg, webp, gif; max 4 GB. Returns the mediaId to use with add_clip. Requires an open project.",
    inputSchema: obj({ path: str, name: str }, ["path"]),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: async (args, host) => {
      if (typeof host.importMediaFromPath !== "function") {
        return fail("import_media_from_path is not available in this host", "UNSUPPORTED");
      }
      if (typeof args.path !== "string" || args.path.trim() === "") {
        return fail("path is required", "INVALID_PARAMS");
      }
      host.requireOpenProject();
      const ref = await host.importMediaFromPath(args.path, {
        name: typeof args.name === "string" ? args.name : undefined,
      });
      return ok(`Imported ${ref.type} "${ref.name}" (${ref.durationSec.toFixed(2)}s)`, ref);
    },
  },
];
