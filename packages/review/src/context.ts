// DLT Cafe: review context. When Claude registers a preview for review (the
// creator pack's register_review.py, now backed by OpenReel), it records what
// it added to the cut as events {id, type, t0, t1, text}. Notes are then tied
// to the event under them, the same way Edit Review anchors notes to an event
// id or a time.
import {
  defaultClock,
  normalizeContext,
  reopenReview,
  type ReviewClock,
  type ReviewContext,
  type ReviewEditEvent,
  type ReviewNote,
  type ReviewState,
} from "./model";

export interface SetContextInput {
  readonly reviewId?: string;
  readonly title?: string;
  readonly batch?: string | null;
  readonly styleId?: string | null;
  readonly events?: readonly unknown[];
  readonly finalPath?: string | null;
  /** New preview: bump rev and put approval back to draft (notes are kept). */
  readonly newPreview?: boolean;
}

export function setReviewContext(
  state: ReviewState,
  input: SetContextInput,
  clock: ReviewClock = defaultClock,
): ReviewState {
  const prev: ReviewContext = state.context ?? { events: [] };
  const merged: Record<string, unknown> = { ...prev };
  for (const key of ["reviewId", "title", "batch", "styleId", "finalPath"] as const) {
    const v = input[key];
    if (v === null) delete merged[key];
    else if (v !== undefined) merged[key] = v;
  }
  if (input.events) merged.events = input.events;
  if (input.newPreview) {
    merged.rev = (prev.rev ?? 0) + 1;
    delete merged.finalPath;
  }
  const context = normalizeContext(merged);
  const next = { ...state, context };
  return input.newPreview && state.approval.status !== "draft" ? reopenReview(next, clock) : next;
}

/**
 * The event a note points at: one whose span covers the note's time (with a
 * little slack), preferring the shortest, i.e. the most specific thing on screen.
 */
export function eventForNote(
  events: readonly ReviewEditEvent[],
  note: Pick<ReviewNote, "t">,
  slack = 0.05,
): ReviewEditEvent | undefined {
  let best: ReviewEditEvent | undefined;
  for (const e of events) {
    if (note.t < e.t0 - slack || note.t > e.t1 + slack) continue;
    if (!best || e.t1 - e.t0 < best.t1 - best.t0) best = e;
  }
  return best;
}
