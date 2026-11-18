// DLT Cafe tool additions. Kept apart from registry.ts so upstream merges stay
// clean; registry.ts merges DLTCAFE_TOOLS into REGISTRY.
//
// Type-only imports from ./registry: a runtime import would create an
// evaluation cycle (registry.ts imports this file before its helpers exist).
import type { RegisteredTool } from "./registry";
import type { JSONSchema, ToolResult } from "./types";
import type { Project } from "@openreel/core/types/project";
import {
  addNote,
  clipAtTime,
  describeAnchor,
  getReview,
  markClaudeSeen,
  replyToNote,
  reviewEventSince,
  ReviewError,
  setNoteStatus,
  sortedNotes,
  summarize,
  type ReviewNote,
  type ReviewState,
} from "@openreel/review";

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

export interface PortableEditImportResult {
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
  {
    name: "import_portable_edit",
    domain: "project",
    title: "Import portable edit from local path",
    description:
      "Load an openreel-edit v2 JSON (e.g. written by pr-handoff `prh.py openreel`) from an approved local folder and REPLACE the current project's timeline with it as one undo step (desktop app only). Media are relinked by file name + size from mediaDir (absolute, ~/, or relative to the JSON's folder; default: the JSON's folder), importing each file once with the same folder rules as import_media_from_path. Audio-track refs to video files get their audio separated. Returns linked/missing counts. Create or open the target project first, then save_project.",
    inputSchema: obj({ path: str, mediaDir: str }, ["path"]),
    readOnly: false,
    destructive: true,
    expensive: true,
    handler: async (args, host) => {
      if (typeof host.importPortableEditFromPath !== "function") {
        return fail("import_portable_edit is not available in this host", "UNSUPPORTED");
      }
      if (typeof args.path !== "string" || args.path.trim() === "") {
        return fail("path is required", "INVALID_PARAMS");
      }
      host.requireOpenProject();
      const res = await host.importPortableEditFromPath(args.path, {
        mediaDir: typeof args.mediaDir === "string" ? args.mediaDir : undefined,
      });
      const summary =
        `Imported "${res.projectName}": ${res.clips} clips on ${res.tracks} tracks, ${res.durationSec.toFixed(2)}s; ` +
        `media ${res.linked}/${res.mediaRefs} linked (${res.filesImported} files imported, ${res.filesReused} reused, ` +
        `${res.audioSeparated} audio separated)` +
        (res.clampedClips ? `; ${res.clampedClips} clip end(s) trimmed to decoded media length` : "") +
        (res.missing.length ? `; ${res.missing.length} MISSING` : "");
      return ok(summary, res);
    },
  },
];

// ---- Review layer (packages/review) -------------------------------------------
// The person leaves timestamped notes in the Review panel, then presses
// "Send notes to Claude" or "Approve". Claude reads open notes, edits, and
// answers each one (reply_review_note marks it done unless status:"open").

const num: JSONSchema = { type: "number" };
const statusEnum = (values: string[]): JSONSchema => ({ type: "string", enum: values });

function readReview(host: Parameters<RegisteredTool["handler"]>[1]): ReviewState {
  return getReview(host.getProject());
}

function writeReview(
  host: Parameters<RegisteredTool["handler"]>[1],
  update: (review: ReviewState, project: Project) => ReviewState,
): ReviewState | ToolResult {
  if (typeof host.updateReview !== "function") {
    return fail("Review notes can't be changed in this host", "UNSUPPORTED");
  }
  host.requireOpenProject();
  return host.updateReview(update);
}

const isResult = (v: ReviewState | ToolResult): v is ToolResult => "ok" in v;

function reviewFail(error: unknown): ToolResult {
  if (error instanceof ReviewError) return fail(error.message, error.code);
  throw error;
}

function noteView(project: Project, note: ReviewNote) {
  const anchor = describeAnchor(project, note);
  return { ...note, anchor: anchor ?? null };
}

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

DLTCAFE_TOOLS.push(
  {
    name: "get_review_status",
    domain: "project",
    title: "Review status",
    description:
      "Review state of the open project: approval (draft | changes_requested | approved), note counts (open/done), whether the person pressed 'Send notes to Claude' and is waiting (waitingForClaude), and how many open notes have no reply from Claude yet. Call this to check for new review notes.",
    inputSchema: obj({}),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: (_args, host) => {
      host.requireOpenProject();
      const s = summarize(readReview(host));
      const line =
        s.approval === "approved"
          ? `Approved${s.open ? ` (${s.open} note(s) still open)` : ""}.`
          : s.approval === "changes_requested"
            ? `Changes requested: ${s.open} open note(s)${s.waitingForClaude ? ", waiting for Claude" : ""}.`
            : `Draft: ${s.open} open / ${s.done} done note(s).`;
      return ok(line, s);
    },
  },
  {
    name: "list_review_notes",
    domain: "project",
    title: "List review notes",
    description:
      "Timestamped review notes on the open project, sorted by time, with replies and the clip each note points at (anchor: clipId, trackName, mediaName, clip start/end, sourceTime; missing:true if that clip was deleted). status: open (default) | done | all. Marks the notes as seen by Claude.",
    inputSchema: obj({ status: statusEnum(["open", "done", "all"]) }),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: (args, host) => {
      host.requireOpenProject();
      const filter = args.status === "done" || args.status === "all" ? args.status : "open";
      const review =
        typeof host.updateReview === "function" ? host.updateReview((r) => markClaudeSeen(r)) : readReview(host);
      const project = host.getProject();
      const notes = sortedNotes(review.notes).filter((n) => filter === "all" || n.status === filter);
      const lines = notes.map((n) => `- [${n.id}] ${fmt(n.t)} ${n.status}: ${n.text}${n.replies.length ? ` (${n.replies.length} repl${n.replies.length === 1 ? "y" : "ies"})` : ""}`);
      return ok(
        `${notes.length} ${filter === "all" ? "" : filter + " "}review note(s); approval ${review.approval.status}${lines.length ? "\n" + lines.join("\n") : ""}`,
        { summary: summarize(review), notes: notes.map((n) => noteView(project, n)) },
      );
    },
  },
  {
    name: "add_review_note",
    domain: "project",
    title: "Add review note",
    description:
      "Add a timestamped review note as Claude (e.g. a question for the person, or something to check). t in seconds on the timeline; optional t1 for a range; clipId defaults to the visible clip at t.",
    inputSchema: obj({ t: num, t1: num, clipId: str, text: str }, ["t", "text"]),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: (args, host) => {
      try {
        let added: ReviewNote | undefined;
        const res = writeReview(host, (review, project) => {
          const clipId = typeof args.clipId === "string" ? args.clipId : clipAtTime(project, Number(args.t))?.clipId;
          const out = addNote(review, {
            t: args.t as number,
            ...(args.t1 !== undefined ? { t1: args.t1 as number } : {}),
            ...(clipId ? { clipId } : {}),
            text: args.text as string,
            author: "claude",
          });
          added = out.note;
          return out.state;
        });
        if (isResult(res)) return res;
        return ok(`Added note ${added!.id} at ${fmt(added!.t)}`, added);
      } catch (error) {
        return reviewFail(error);
      }
    },
  },
  {
    name: "reply_review_note",
    domain: "project",
    title: "Reply to review note",
    description:
      "Answer a review note in its thread (one line on what you changed, or a question). Marks the note done by default; pass status:'open' to keep it open (e.g. when asking a question).",
    inputSchema: obj({ noteId: str, text: str, status: statusEnum(["done", "open"]) }, ["noteId", "text"]),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: (args, host) => {
      try {
        const status = args.status === "open" ? "open" : "done";
        const res = writeReview(host, (review) =>
          replyToNote(review, String(args.noteId), { text: args.text as string, author: "claude", status }).state,
        );
        if (isResult(res)) return res;
        const note = res.notes.find((n) => n.id === args.noteId);
        return ok(`Replied to ${args.noteId}; note is ${status}`, note);
      } catch (error) {
        return reviewFail(error);
      }
    },
  },
  {
    name: "resolve_review_note",
    domain: "project",
    title: "Resolve review note",
    description: "Mark a review note done (default) or reopen it with status:'open'.",
    inputSchema: obj({ noteId: str, status: statusEnum(["done", "open"]) }, ["noteId"]),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: (args, host) => {
      try {
        const status = args.status === "open" ? "open" : "done";
        const res = writeReview(host, (review) => setNoteStatus(review, String(args.noteId), status));
        if (isResult(res)) return res;
        return ok(`Note ${args.noteId} is ${status}`, res.notes.find((n) => n.id === args.noteId));
      } catch (error) {
        return reviewFail(error);
      }
    },
  },
);

/** Longest wait per call; stays under the desktop bridge's 120 s per-call limit. */
export const REVIEW_WAIT_MAX_SEC = 110;
const REVIEW_WAIT_DEFAULT_SEC = 100;

/**
 * DLT Cafe tools that only wait and read, so the MCP listener runs them
 * without the shared host lock (a long wait must not block other calls).
 */
export const DLTCAFE_UNLOCKED_TOOLS: ReadonlySet<string> = new Set(["wait_for_review_send"]);

DLTCAFE_TOOLS.push({
  name: "wait_for_review_send",
  domain: "project",
  title: "Wait for review Send/Approve",
  description:
    `Block until the person presses "Send notes to Claude" or "Approve" in the Review panel, or until timeoutSec passes (default ${REVIEW_WAIT_DEFAULT_SEC}, max ${REVIEW_WAIT_MAX_SEC}). Returns {event: "send" | "approve" | "timeout", at, cursor}. Call again with since=cursor to keep listening; without since, a Send/Approve Claude hasn't read yet (list_review_notes) returns at once. After "send", call list_review_notes, make the edits, and reply to each note.`,
  inputSchema: obj({ since: str, timeoutSec: num }),
  readOnly: true,
  destructive: false,
  expensive: false,
  handler: async (args, host) => {
    host.requireOpenProject();
    const since = typeof args.since === "string" && args.since ? args.since : undefined;
    const now = reviewEventSince(readReview(host), since);
    if (now) return ok(`Review ${now.event} at ${now.at}`, { ...now, cursor: now.at });
    if (typeof host.waitForReviewEvent !== "function") {
      return fail("wait_for_review_send is not available in this host", "UNSUPPORTED");
    }
    const sec = typeof args.timeoutSec === "number" && Number.isFinite(args.timeoutSec)
      ? Math.min(Math.max(args.timeoutSec, 1), REVIEW_WAIT_MAX_SEC)
      : REVIEW_WAIT_DEFAULT_SEC;
    const event = await host.waitForReviewEvent(since, sec * 1000);
    if (!event) {
      const cursor = since ?? readReview(host).claudeSeenAt ?? "";
      return ok(`No Send or Approve within ${sec}s; call again with since to keep waiting`, { event: "timeout", at: null, cursor });
    }
    return ok(`Review ${event.event} at ${event.at}`, { ...event, cursor: event.at });
  },
});
