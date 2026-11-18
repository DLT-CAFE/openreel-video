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
  eventForNote,
  getReview,
  markClaudeSeen,
  replyToNote,
  reviewEventSince,
  ReviewError,
  setNoteStatus,
  setReviewContext,
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

function noteView(project: Project, note: ReviewNote, review?: ReviewState) {
  const anchor = describeAnchor(project, note);
  // DLT Cafe: the edit event under the note (caption, headline, b-roll...), as in Edit Review.
  const ev = review?.context ? eventForNote(review.context.events, note) : undefined;
  return { ...note, anchor: anchor ?? null, ...(ev ? { eventId: ev.id, event: { type: ev.type, text: ev.text ?? "" } } : {}) };
}

function contextView(review: ReviewState) {
  const c = review.context;
  if (!c) return null;
  return {
    reviewId: c.reviewId ?? null,
    title: c.title ?? null,
    batch: c.batch ?? null,
    styleId: c.styleId ?? null,
    rev: c.rev ?? 0,
    events: c.events.length,
    finalPath: c.finalPath ?? null,
  };
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
      const review = readReview(host);
      const s = summarize(review);
      const line =
        s.approval === "approved"
          ? `Approved${s.open ? ` (${s.open} note(s) still open)` : ""}.`
          : s.approval === "changes_requested"
            ? `Changes requested: ${s.open} open note(s)${s.waitingForClaude ? ", waiting for Claude" : ""}.`
            : `Draft: ${s.open} open / ${s.done} done note(s).`;
      return ok(line, {
        ...s,
        applyToBatch: review.approval.applyToBatch === true,
        context: contextView(review),
      });
    },
  },
  {
    name: "list_review_notes",
    domain: "project",
    title: "List review notes",
    description:
      "Timestamped review notes on the open project, sorted by time, with replies and the clip each note points at (anchor: clipId, trackName, mediaName, clip start/end, sourceTime; missing:true if that clip was deleted), plus eventId/event when set_review_context recorded the edit events. status: open (default) | done | all. Marks the notes as seen by Claude.",
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
        { summary: summarize(review), notes: notes.map((n) => noteView(project, n, review)) },
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

DLTCAFE_TOOLS.push({
  name: "set_review_context",
  domain: "project",
  title: "Set review context",
  description:
    "Record what the open project's review is about, as Edit Review did: reviewId (the creator pack's --id), title, batch (Approve then offers 'apply my notes to the rest'), styleId, and events = what you added to the cut [{id, type, t0, t1, text}] (caption, headline, graphic, broll, zoom, sfx, music, cut...; keep ids stable across re-renders). Notes are then tied to the event under them (list_review_notes eventId). newPreview:true = a new preview was registered: bumps rev and puts approval back to draft (notes are kept). finalPath marks the full-quality render. Pass null to clear a field.",
  inputSchema: obj({
    reviewId: str,
    title: str,
    batch: { type: ["string", "null"] },
    styleId: { type: ["string", "null"] },
    events: { type: "array", items: { type: "object" } },
    finalPath: { type: ["string", "null"] },
    newPreview: { type: "boolean" },
  }),
  readOnly: false,
  destructive: false,
  expensive: false,
  handler: (args, host) => {
    try {
      const res = writeReview(host, (review) =>
        setReviewContext(review, {
          ...(typeof args.reviewId === "string" ? { reviewId: args.reviewId } : {}),
          ...(typeof args.title === "string" ? { title: args.title } : {}),
          ...(args.batch === null || typeof args.batch === "string" ? { batch: args.batch as string | null } : {}),
          ...(args.styleId === null || typeof args.styleId === "string" ? { styleId: args.styleId as string | null } : {}),
          ...(Array.isArray(args.events) ? { events: args.events } : {}),
          ...(args.finalPath === null || typeof args.finalPath === "string" ? { finalPath: args.finalPath as string | null } : {}),
          newPreview: args.newPreview === true,
        }),
      );
      if (isResult(res)) return res;
      const c = contextView(res);
      return ok(`Review context set: ${c?.events ?? 0} event(s), rev ${c?.rev ?? 0}, approval ${res.approval.status}`, c);
    } catch (error) {
      return reviewFail(error);
    }
  },
});

// Markers and subtitles have remove_* tools but no way to list their ids; the
// creator pack's review scripts need them to replace a preview's markers.
DLTCAFE_TOOLS.push(
  {
    name: "list_markers",
    domain: "read",
    title: "List timeline markers",
    description: "Timeline markers of the open project: [{id, time, label, color}], sorted by time. Use an id with update_marker / remove_marker.",
    inputSchema: obj({}),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: (_args, host) => {
      host.requireOpenProject();
      const markers = [...(host.getProject().timeline.markers ?? [])].sort((a, b) => a.time - b.time);
      return ok(`${markers.length} marker(s)`, markers);
    },
  },
  {
    name: "list_subtitles",
    domain: "read",
    title: "List subtitles",
    description: "Subtitles of the open project: [{id, startTime, endTime, text}], sorted by time. Use an id with update_subtitle / remove_subtitle.",
    inputSchema: obj({}),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: (_args, host) => {
      host.requireOpenProject();
      const subs = [...(host.getProject().timeline.subtitles ?? [])]
        .sort((a, b) => a.startTime - b.startTime)
        .map((x) => ({ id: x.id, startTime: x.startTime, endTime: x.endTime, text: x.text }));
      return ok(`${subs.length} subtitle(s)`, subs);
    },
  },
);

// ---- Creator styles (the content creator pack, read live from disk) ----------
// OpenReel doesn't re-implement the styles: Claude runs the style's skill (paths
// below), then loads the result and opens it for review.

const STYLE_JOB_STATUSES = ["waiting", "in-progress", "in-review", "done", "cancelled"];

function styleSummary(s: Record<string, unknown>) {
  const tags = Array.isArray(s.tags) ? (s.tags as string[]) : [];
  return { id: s.id, name: s.name, kind: s.kind, blurb: s.blurb, bestFor: s.cues, tags };
}

DLTCAFE_TOOLS.push(
  {
    name: "list_creator_styles",
    domain: "read",
    title: "List creator styles",
    description:
      "The creator pack's editing styles available on this computer (read live, so new ones appear without a rebuild): id, name, kind (reel | long | clips | caption), blurb, bestFor (what footage suits it) and tags. Optional filters: kind, tag, query (words matched against name, blurb, bestFor, tags). Use get_creator_style for one style's skill and preview paths.",
    inputSchema: obj({ kind: str, tag: str, query: str }),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: async (args, host) => {
      if (typeof host.getCreatorStyles !== "function") return fail("Creator styles aren't available in this host", "UNSUPPORTED");
      const index = await host.getCreatorStyles();
      if (!index.ok) return fail(index.error ?? "No creator styles found", "NOT_FOUND");
      const q = typeof args.query === "string" ? args.query.toLowerCase().split(/\s+/).filter(Boolean) : [];
      const list = index.styles
        .filter((s) => (typeof args.kind === "string" && args.kind ? s.kind === args.kind : true))
        .filter((s) => (typeof args.tag === "string" && args.tag ? Array.isArray(s.tags) && (s.tags as string[]).includes(args.tag) : true))
        .filter((s) => {
          if (!q.length) return true;
          const hay = JSON.stringify([s.id, s.name, s.blurb, s.cues, s.tags, s.aliases, s.lends]).toLowerCase();
          return q.every((w) => hay.includes(w));
        })
        .map(styleSummary);
      return ok(`${list.length} creator style(s) from ${index.root}`, { root: index.root, styles: list });
    },
  },
  {
    name: "get_creator_style",
    domain: "read",
    title: "Get creator style",
    description:
      "One creator style in full: catalog fields (layouts, caption, hook, lends, tags...), skillPath (its SKILL.md: read and follow it to make the edit), and paths to its poster, looping preview video and live HTML sample when it has one.",
    inputSchema: obj({ id: str }, ["id"]),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: async (args, host) => {
      if (typeof host.getCreatorStyles !== "function") return fail("Creator styles aren't available in this host", "UNSUPPORTED");
      const index = await host.getCreatorStyles();
      const id = String(args.id ?? "");
      const style = index.styles.find((s) => s.id === id || (Array.isArray(s.aliases) && (s.aliases as string[]).includes(id)));
      if (!style) return fail(`No creator style "${id}"`, "NOT_FOUND");
      return ok(`${style.name} (${style.kind})`, style);
    },
  },
  {
    name: "start_style_job",
    domain: "project",
    title: "Start a creator style job",
    description:
      "Set up an edit in a creator style: creates a new project with the style's canvas (9:16 for reels/clips/captions, 16:9 for long form), imports the footage (absolute paths inside an approved folder; desktop app), tags the project with the style and records a job the Collaborate panel shows. Then run the style's skill (get_creator_style skillPath) on the footage, register the preview with register_review.py --id <job id> --style <style id> (or import_portable_edit), and call update_style_job.",
    inputSchema: obj({ styleId: str, paths: { type: "array", items: str }, name: str, notes: str }, ["styleId", "paths"]),
    readOnly: false,
    destructive: false,
    expensive: true,
    handler: async (args, host) => {
      if (typeof host.startStyleJob !== "function") return fail("Style jobs aren't available in this host", "UNSUPPORTED");
      const paths = Array.isArray(args.paths) ? (args.paths as unknown[]).filter((p): p is string => typeof p === "string" && p.trim() !== "") : [];
      if (!paths.length) return fail("paths: give at least one footage file", "INVALID_PARAMS");
      const job = await host.startStyleJob({
        styleId: String(args.styleId ?? ""),
        paths,
        ...(typeof args.name === "string" ? { name: args.name } : {}),
        ...(typeof args.notes === "string" ? { notes: args.notes } : {}),
      });
      return ok(`Style job ${job.id} ready: project "${job.projectName}" with ${paths.length} clip(s) in ${job.styleName}`, job);
    },
  },
  {
    name: "list_style_jobs",
    domain: "read",
    title: "List style jobs",
    description:
      "Creator style jobs started from OpenReel (\"Use this style\") or start_style_job, newest first: id, styleId, styleName, project, footage (paths, or file names when picked in the browser), notes, status (waiting | in-progress | in-review | done | cancelled). Pick up 'waiting' jobs: run the style's skill on the footage.",
    inputSchema: obj({ status: { type: "string", enum: STYLE_JOB_STATUSES } }),
    readOnly: true,
    destructive: false,
    expensive: false,
    handler: async (args, host) => {
      if (typeof host.listStyleJobs !== "function") return fail("Style jobs aren't available in this host", "UNSUPPORTED");
      const jobs = (await host.listStyleJobs()).filter((j) => (typeof args.status === "string" ? j.status === args.status : true));
      return ok(`${jobs.length} style job(s)`, jobs);
    },
  },
  {
    name: "update_style_job",
    domain: "project",
    title: "Update style job",
    description: "Move a style job along: status (in-progress | in-review | done | cancelled), reviewId (the register_review.py --id) and a short message the Collaborate panel shows.",
    inputSchema: obj({ jobId: str, status: { type: "string", enum: STYLE_JOB_STATUSES }, reviewId: str, message: str }, ["jobId"]),
    readOnly: false,
    destructive: false,
    expensive: false,
    handler: async (args, host) => {
      if (typeof host.updateStyleJob !== "function") return fail("Style jobs aren't available in this host", "UNSUPPORTED");
      const job = await host.updateStyleJob(String(args.jobId ?? ""), {
        ...(typeof args.status === "string" ? { status: args.status } : {}),
        ...(typeof args.reviewId === "string" ? { reviewId: args.reviewId } : {}),
        ...(typeof args.message === "string" ? { message: args.message } : {}),
      });
      if (!job) return fail(`No style job "${String(args.jobId)}"`, "NOT_FOUND");
      return ok(`Job ${job.id} is ${job.status}`, job);
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
    const batchFlag = () => ({ applyToBatch: readReview(host).approval.applyToBatch === true });
    if (now) return ok(`Review ${now.event} at ${now.at}`, { ...now, cursor: now.at, ...batchFlag() });
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
    return ok(`Review ${event.event} at ${event.at}`, { ...event, cursor: event.at, ...batchFlag() });
  },
});
