// DLT Cafe review layer: timestamped notes on the timeline, threaded replies,
// open/done status and an approval flow, stored with the project.
// Modelled on the creator pack's Edit Review (notes.json + approval.json):
// the person leaves notes and presses "Send notes to Claude" or "Approve";
// Claude reads the open notes, edits, and answers each note (usually marking
// it done). All functions are pure: they return a new ReviewState.

export type ReviewAuthor = "user" | "claude";
export type ReviewNoteStatus = "open" | "done";
export type ReviewApprovalStatus = "draft" | "changes_requested" | "approved";

export interface ReviewReply {
  readonly id: string;
  readonly author: ReviewAuthor;
  readonly text: string;
  /** ISO time. */
  readonly at: string;
}

export interface ReviewNote {
  readonly id: string;
  /** Timeline time in seconds the note points at. */
  readonly t: number;
  /** Optional end of a range, seconds (> t). */
  readonly t1?: number;
  /** Clip the note is anchored to (usually the clip under the playhead). */
  readonly clipId?: string;
  readonly text: string;
  readonly author: ReviewAuthor;
  readonly status: ReviewNoteStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly replies: readonly ReviewReply[];
}

export interface ReviewApproval {
  readonly status: ReviewApprovalStatus;
  /** ISO time of the last Send/Approve/Reopen. */
  readonly at?: string;
  /** Open notes when the person last pressed "Send notes to Claude". */
  readonly notesSentCount?: number;
}

export interface ReviewState {
  readonly version: 1;
  readonly notes: readonly ReviewNote[];
  readonly approval: ReviewApproval;
  /** ISO time the person last pressed "Send notes to Claude". */
  readonly sentAt?: string;
  /** ISO time Claude last read the notes (list_review_notes). */
  readonly claudeSeenAt?: string;
}

export const MAX_NOTE_TEXT = 4000;
export const MAX_NOTES = 2000;
export const MAX_REPLIES = 200;

export const EMPTY_REVIEW: ReviewState = Object.freeze({
  version: 1,
  notes: Object.freeze([]) as readonly ReviewNote[],
  approval: Object.freeze({ status: "draft" }) as ReviewApproval,
}) as ReviewState;

export interface ReviewClock {
  now(): string;
  id(): string;
}

export const defaultClock: ReviewClock = {
  now: () => new Date().toISOString(),
  id: () =>
    (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.() ??
    `rv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
};

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_PARAMS" = "INVALID_PARAMS",
  ) {
    super(message);
    this.name = "ReviewError";
  }
}

function cleanText(text: unknown): string {
  if (typeof text !== "string") throw new ReviewError("text must be a string");
  const trimmed = text.trim();
  if (!trimmed) throw new ReviewError("text is empty");
  if (trimmed.length > MAX_NOTE_TEXT) throw new ReviewError(`text is longer than ${MAX_NOTE_TEXT} characters`);
  return trimmed;
}

function cleanTime(t: unknown, name = "t"): number {
  if (typeof t !== "number" || !Number.isFinite(t) || t < 0 || t > 86400) {
    throw new ReviewError(`${name} must be a time in seconds (0..86400)`);
  }
  return Math.round(t * 1000) / 1000;
}

function findNote(state: ReviewState, noteId: string): ReviewNote {
  const note = state.notes.find((n) => n.id === noteId);
  if (!note) throw new ReviewError(`Review note not found: ${noteId}`, "NOT_FOUND");
  return note;
}

function replaceNote(state: ReviewState, note: ReviewNote): ReviewState {
  return { ...state, notes: state.notes.map((n) => (n.id === note.id ? note : n)) };
}

/** Notes sorted by time, then creation. */
export function sortedNotes(notes: readonly ReviewNote[]): ReviewNote[] {
  return [...notes].sort((a, b) => a.t - b.t || a.createdAt.localeCompare(b.createdAt));
}

export interface AddNoteInput {
  readonly t: number;
  readonly t1?: number;
  readonly clipId?: string;
  readonly text: string;
  readonly author?: ReviewAuthor;
}

export function addNote(
  state: ReviewState,
  input: AddNoteInput,
  clock: ReviewClock = defaultClock,
): { state: ReviewState; note: ReviewNote } {
  if (state.notes.length >= MAX_NOTES) throw new ReviewError(`A project can hold at most ${MAX_NOTES} notes`);
  const t = cleanTime(input.t);
  const t1 = input.t1 === undefined ? undefined : cleanTime(input.t1, "t1");
  if (t1 !== undefined && t1 <= t) throw new ReviewError("t1 must be after t");
  const now = clock.now();
  const note: ReviewNote = {
    id: clock.id(),
    t,
    ...(t1 !== undefined ? { t1 } : {}),
    ...(input.clipId ? { clipId: String(input.clipId) } : {}),
    text: cleanText(input.text),
    author: input.author ?? "user",
    status: "open",
    createdAt: now,
    updatedAt: now,
    replies: [],
  };
  // A new note after approval means the cut needs another pass.
  const approval: ReviewApproval =
    state.approval.status === "approved" ? { status: "draft", at: now } : state.approval;
  return { state: { ...state, approval, notes: [...state.notes, note] }, note };
}

export function editNote(
  state: ReviewState,
  noteId: string,
  patch: { text?: string; t?: number; t1?: number | null; clipId?: string | null },
  clock: ReviewClock = defaultClock,
): ReviewState {
  const note = findNote(state, noteId);
  const t = patch.t === undefined ? note.t : cleanTime(patch.t);
  const t1 = patch.t1 === null ? undefined : patch.t1 === undefined ? note.t1 : cleanTime(patch.t1, "t1");
  if (t1 !== undefined && t1 <= t) throw new ReviewError("t1 must be after t");
  const clipId = patch.clipId === null ? undefined : patch.clipId ?? note.clipId;
  const { t1: _t1, clipId: _c, ...rest } = note;
  return replaceNote(state, {
    ...rest,
    t,
    ...(t1 !== undefined ? { t1 } : {}),
    ...(clipId ? { clipId } : {}),
    text: patch.text === undefined ? note.text : cleanText(patch.text),
    updatedAt: clock.now(),
  });
}

export function deleteNote(state: ReviewState, noteId: string): ReviewState {
  findNote(state, noteId);
  return { ...state, notes: state.notes.filter((n) => n.id !== noteId) };
}

export function replyToNote(
  state: ReviewState,
  noteId: string,
  input: { text: string; author: ReviewAuthor; status?: ReviewNoteStatus },
  clock: ReviewClock = defaultClock,
): { state: ReviewState; reply: ReviewReply } {
  const note = findNote(state, noteId);
  if (note.replies.length >= MAX_REPLIES) throw new ReviewError(`A note can hold at most ${MAX_REPLIES} replies`);
  const at = clock.now();
  const reply: ReviewReply = { id: clock.id(), author: input.author, text: cleanText(input.text), at };
  const next: ReviewNote = {
    ...note,
    replies: [...note.replies, reply],
    status: input.status ?? note.status,
    updatedAt: at,
  };
  return { state: replaceNote(state, next), reply };
}

export function setNoteStatus(
  state: ReviewState,
  noteId: string,
  status: ReviewNoteStatus,
  clock: ReviewClock = defaultClock,
): ReviewState {
  if (status !== "open" && status !== "done") throw new ReviewError("status must be open or done");
  const note = findNote(state, noteId);
  if (note.status === status) return state;
  return replaceNote(state, { ...note, status, updatedAt: clock.now() });
}

/** "Send notes to Claude": asks for changes on every open note. */
export function sendNotesToClaude(state: ReviewState, clock: ReviewClock = defaultClock): ReviewState {
  const open = state.notes.filter((n) => n.status === "open").length;
  if (open === 0) throw new ReviewError("There are no open notes to send");
  const at = clock.now();
  return { ...state, sentAt: at, approval: { status: "changes_requested", at, notesSentCount: open } };
}

export function approve(state: ReviewState, clock: ReviewClock = defaultClock): ReviewState {
  return { ...state, approval: { status: "approved", at: clock.now() } };
}

/** Back to draft (e.g. the person wants another look after approving). */
export function reopenReview(state: ReviewState, clock: ReviewClock = defaultClock): ReviewState {
  return { ...state, approval: { status: "draft", at: clock.now() } };
}

export function markClaudeSeen(state: ReviewState, clock: ReviewClock = defaultClock): ReviewState {
  return { ...state, claudeSeenAt: clock.now() };
}

export interface ReviewSummary {
  readonly approval: ReviewApprovalStatus;
  readonly approvalAt?: string;
  readonly total: number;
  readonly open: number;
  readonly done: number;
  readonly sentAt?: string;
  readonly claudeSeenAt?: string;
  /** Person pressed Send and Claude hasn't read the notes since. */
  readonly waitingForClaude: boolean;
  /** Open notes whose latest message (note or reply) is from the person. */
  readonly unanswered: number;
}

export function summarize(state: ReviewState): ReviewSummary {
  const open = state.notes.filter((n) => n.status === "open");
  // Waiting on Claude: the latest word in the thread (note or reply) is the person's.
  const unanswered = open.filter((n) => (n.replies[n.replies.length - 1]?.author ?? n.author) !== "claude").length;
  const waitingForClaude =
    state.approval.status === "changes_requested" &&
    !!state.sentAt &&
    (!state.claudeSeenAt || state.claudeSeenAt < state.sentAt);
  return {
    approval: state.approval.status,
    ...(state.approval.at ? { approvalAt: state.approval.at } : {}),
    total: state.notes.length,
    open: open.length,
    done: state.notes.length - open.length,
    ...(state.sentAt ? { sentAt: state.sentAt } : {}),
    ...(state.claudeSeenAt ? { claudeSeenAt: state.claudeSeenAt } : {}),
    waitingForClaude,
    unanswered,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 86400;
const author = (v: unknown): ReviewAuthor => (v === "claude" ? "claude" : "user");

/**
 * Accept whatever was stored (older versions, hand-edited files) and return a
 * well-formed ReviewState. Invalid notes/replies are dropped, never thrown on.
 */
export function normalizeReview(raw: unknown): ReviewState {
  if (!isObj(raw)) return EMPTY_REVIEW;
  const notes: ReviewNote[] = [];
  for (const n of Array.isArray(raw.notes) ? raw.notes.slice(0, MAX_NOTES) : []) {
    if (!isObj(n) || !isStr(n.id) || !isTime(n.t) || !isStr(n.text) || !n.text.trim()) continue;
    const replies: ReviewReply[] = [];
    for (const r of Array.isArray(n.replies) ? n.replies.slice(0, MAX_REPLIES) : []) {
      if (!isObj(r) || !isStr(r.id) || !isStr(r.text) || !r.text.trim()) continue;
      replies.push({ id: r.id, author: author(r.author), text: r.text.slice(0, MAX_NOTE_TEXT), at: isStr(r.at) ? r.at : "" });
    }
    const created = isStr(n.createdAt) ? n.createdAt : "";
    notes.push({
      id: n.id,
      t: n.t,
      ...(isTime(n.t1) && n.t1 > n.t ? { t1: n.t1 } : {}),
      ...(isStr(n.clipId) && n.clipId ? { clipId: n.clipId } : {}),
      text: n.text.slice(0, MAX_NOTE_TEXT),
      author: author(n.author),
      status: n.status === "done" ? "done" : "open",
      createdAt: created,
      updatedAt: isStr(n.updatedAt) ? n.updatedAt : created,
      replies,
    });
  }
  const ap = isObj(raw.approval) ? raw.approval : {};
  const status: ReviewApprovalStatus =
    ap.status === "approved" || ap.status === "changes_requested" ? ap.status : "draft";
  return {
    version: 1,
    notes,
    approval: {
      status,
      ...(isStr(ap.at) ? { at: ap.at } : {}),
      ...(typeof ap.notesSentCount === "number" ? { notesSentCount: ap.notesSentCount } : {}),
    },
    ...(isStr(raw.sentAt) ? { sentAt: raw.sentAt } : {}),
    ...(isStr(raw.claudeSeenAt) ? { claudeSeenAt: raw.claudeSeenAt } : {}),
  };
}

export type ReviewEventKind = "send" | "approve";

export interface ReviewEvent {
  readonly event: ReviewEventKind;
  /** ISO time of the event; pass it back as `since` to wait for the next one. */
  readonly at: string;
}

/**
 * The latest Send/Approve after `since` (ISO). Without `since`, anything Claude
 * hasn't seen yet counts (claudeSeenAt), so a Send made before Claude started
 * waiting is not missed.
 */
export function reviewEventSince(state: ReviewState, since?: string): ReviewEvent | null {
  const after = since ?? state.claudeSeenAt ?? "";
  const events: ReviewEvent[] = [];
  if (state.sentAt && state.sentAt > after && state.approval.status === "changes_requested") {
    events.push({ event: "send", at: state.sentAt });
  }
  if (state.approval.status === "approved" && state.approval.at && state.approval.at > after) {
    events.push({ event: "approve", at: state.approval.at });
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  return events[0] ?? null;
}
