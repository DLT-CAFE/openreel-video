import { describe, it, expect } from "vitest";
import {
  EMPTY_REVIEW, addNote, approve, deleteNote, editNote, normalizeReview, replyToNote, reopenReview,
  sendNotesToClaude, setNoteStatus, sortedNotes, summarize, markClaudeSeen, ReviewError, type ReviewClock,
} from "./model";

function clock(): ReviewClock {
  let n = 0;
  return { now: () => new Date(Date.UTC(2026, 10, 18, 8, 0, n++)).toISOString(), id: () => `id${n++}` };
}

describe("review model", () => {
  it("adds notes with clean text, times and anchors", () => {
    const c = clock();
    const { state, note } = addNote(EMPTY_REVIEW, { t: 12.34567, text: "  tighten this cut ", clipId: "c1" }, c);
    expect(note).toMatchObject({ t: 12.346, text: "tighten this cut", clipId: "c1", status: "open", author: "user", replies: [] });
    expect(state.notes).toHaveLength(1);
    expect(EMPTY_REVIEW.notes).toHaveLength(0);
  });

  it("rejects bad input", () => {
    expect(() => addNote(EMPTY_REVIEW, { t: -1, text: "x" })).toThrow(ReviewError);
    expect(() => addNote(EMPTY_REVIEW, { t: 1, text: "   " })).toThrow(/empty/);
    expect(() => addNote(EMPTY_REVIEW, { t: 2, t1: 1, text: "x" })).toThrow(/after/);
    expect(() => addNote(EMPTY_REVIEW, { t: 1, text: "x".repeat(4001) })).toThrow(/longer/);
  });

  it("threads replies and can mark done in the same step", () => {
    const c = clock();
    let { state, note } = addNote(EMPTY_REVIEW, { t: 1, text: "music too loud" }, c);
    ({ state } = replyToNote(state, note.id, { text: "Dropped music 4 dB", author: "claude", status: "done" }, c));
    ({ state } = replyToNote(state, note.id, { text: "still loud at 0:03", author: "user", status: "open" }, c));
    const n = state.notes[0];
    expect(n.replies.map((r) => r.author)).toEqual(["claude", "user"]);
    expect(n.status).toBe("open");
    expect(() => replyToNote(state, "nope", { text: "x", author: "claude" })).toThrow(/not found/);
  });

  it("edits, resolves, reopens and deletes", () => {
    const c = clock();
    let { state, note } = addNote(EMPTY_REVIEW, { t: 5, t1: 6, text: "a", clipId: "c" }, c);
    state = editNote(state, note.id, { text: "b", t1: null, clipId: null }, c);
    expect(state.notes[0]).toMatchObject({ text: "b" });
    expect(state.notes[0].t1).toBeUndefined();
    expect(state.notes[0].clipId).toBeUndefined();
    state = setNoteStatus(state, note.id, "done", c);
    expect(state.notes[0].status).toBe("done");
    expect(setNoteStatus(state, note.id, "done", c)).toBe(state);
    state = deleteNote(state, note.id);
    expect(state.notes).toHaveLength(0);
  });

  it("runs the send / seen / approve flow", () => {
    const c = clock();
    expect(() => sendNotesToClaude(EMPTY_REVIEW, c)).toThrow(/no open notes/);
    let { state } = addNote(EMPTY_REVIEW, { t: 3, text: "cut the pause" }, c);
    state = sendNotesToClaude(state, c);
    expect(summarize(state)).toMatchObject({ approval: "changes_requested", open: 1, waitingForClaude: true, unanswered: 1 });
    state = markClaudeSeen(state, c);
    expect(summarize(state).waitingForClaude).toBe(false);
    state = approve(state, c);
    expect(summarize(state).approval).toBe("approved");
    // A new note after approval puts it back to draft.
    ({ state } = addNote(state, { t: 9, text: "one more" }, c));
    expect(state.approval.status).toBe("draft");
    state = approve(state, c);
    expect(reopenReview(state, c).approval.status).toBe("draft");
  });

  it("sorts by time", () => {
    const c = clock();
    let { state } = addNote(EMPTY_REVIEW, { t: 9, text: "b" }, c);
    ({ state } = addNote(state, { t: 2, text: "a" }, c));
    expect(sortedNotes(state.notes).map((n) => n.text)).toEqual(["a", "b"]);
  });

  it("counts a note as unanswered only when the person had the last word", () => {
    const c = clock();
    let { state, note } = addNote(EMPTY_REVIEW, { t: 1, text: "question from Claude", author: "claude" }, c);
    expect(summarize(state).unanswered).toBe(0);
    ({ state } = replyToNote(state, note.id, { text: "yes trim it", author: "user" }, c));
    expect(summarize(state).unanswered).toBe(1);
  });

  it("normalizes stored data without throwing", () => {
    expect(normalizeReview(undefined)).toEqual(EMPTY_REVIEW);
    expect(normalizeReview("x")).toEqual(EMPTY_REVIEW);
    const s = normalizeReview({
      approval: { status: "weird" },
      notes: [
        { id: "a", t: 1, text: "ok", status: "done", replies: [{ id: "r", text: "hi", author: "claude" }, { bad: 1 }] },
        { id: "b", t: -5, text: "bad time" },
        { id: "c", t: 2, text: "" },
        { id: "d", t: 3, t1: 1, text: "bad range", author: "robot", __proto__: { x: 1 } },
      ],
    });
    expect(s.approval.status).toBe("draft");
    expect(s.notes.map((n) => n.id)).toEqual(["a", "d"]);
    expect(s.notes[0].replies).toHaveLength(1);
    expect(s.notes[1]).toMatchObject({ author: "user", status: "open" });
    expect(s.notes[1].t1).toBeUndefined();
  });
});
