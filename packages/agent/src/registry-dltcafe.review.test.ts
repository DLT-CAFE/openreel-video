import { describe, it, expect } from "vitest";
import type { Project } from "@openreel/core/types/project";
import { getReview, sendNotesToClaude, addNote, type ReviewState } from "@openreel/review";
import { HeadlessHost } from "./headless-host";
import { executeTool } from "./executor";
import { getTool } from "./registry";
import { makeEmptyProject, makeProjectWithClip } from "./test-fixtures";
import { DLTCAFE_UNLOCKED_TOOLS } from "./registry-dltcafe";
import type { EditingHost } from "./host";

function reviewHost(project: Project): EditingHost & { project(): Project } {
  let current = project;
  const base = new HeadlessHost(current);
  return Object.assign(base, {
    getProject: () => current,
    project: () => current,
    updateReview(update: (r: ReviewState, p: Project) => ReviewState): ReviewState {
      const next = update(getReview(current), current);
      current = { ...current, review: next };
      return next;
    },
  });
}

const call = (name: string, args: Record<string, unknown>, host: EditingHost) => executeTool(name, args, host);

describe("review MCP tools", () => {
  it("registers the five tools, none destructive", () => {
    for (const name of ["get_review_status", "list_review_notes", "add_review_note", "reply_review_note", "resolve_review_note"]) {
      const tool = getTool(name);
      expect(tool, name).toBeDefined();
      expect(tool?.destructive).toBe(false);
    }
    expect(getTool("get_review_status")?.readOnly).toBe(true);
  });

  it("reads status on any host, but writes need updateReview", async () => {
    const host = new HeadlessHost(makeEmptyProject());
    const status = await call("get_review_status", {}, host);
    expect(status.ok).toBe(true);
    expect(status.data).toMatchObject({ approval: "draft", total: 0 });
    const added = await call("add_review_note", { t: 1, text: "x" }, host);
    expect(added.error?.code).toBe("UNSUPPORTED");
  });

  it("runs the person -> Claude loop", async () => {
    // The person leaves a note on the clip and presses Send.
    let review = addNote(getReview({}), { t: 2, text: "cut the pause", clipId: "c1" }).state;
    review = sendNotesToClaude(review);
    const host = reviewHost({ ...makeProjectWithClip(), review });

    const status = await call("get_review_status", {}, host);
    expect(status.data).toMatchObject({ approval: "changes_requested", open: 1, waitingForClaude: true, unanswered: 1 });

    const listed = await call("list_review_notes", {}, host);
    const notes = (listed.data as { notes: Array<{ id: string; anchor: { clipId: string } }> }).notes;
    expect(notes).toHaveLength(1);
    expect(notes[0].anchor.clipId).toBe("c1");
    expect(listed.summary).toMatch(/cut the pause/);
    expect((await call("get_review_status", {}, host)).data).toMatchObject({ waitingForClaude: false });

    const replied = await call("reply_review_note", { noteId: notes[0].id, text: "Removed 0.6 s pause" }, host);
    expect(replied.ok).toBe(true);
    const after = getReview(host.project()).notes[0];
    expect(after.status).toBe("done");
    expect(after.replies[0]).toMatchObject({ author: "claude", text: "Removed 0.6 s pause" });

    expect((await call("resolve_review_note", { noteId: notes[0].id, status: "open" }, host)).ok).toBe(true);
    expect(getReview(host.project()).notes[0].status).toBe("open");

    const q = await call("add_review_note", { t: 3, text: "Keep the music here?" }, host);
    expect(q.ok).toBe(true);
    expect(getReview(host.project()).notes[1]).toMatchObject({ author: "claude", clipId: "c1" });

    expect((await call("list_review_notes", { status: "all" }, host)).summary).toMatch(/^2 review note/);
  });

  it("reports bad ids and text as tool errors", async () => {
    const host = reviewHost(makeProjectWithClip());
    expect((await call("reply_review_note", { noteId: "nope", text: "x" }, host)).error?.code).toBe("NOT_FOUND");
    expect((await call("add_review_note", { t: 1, text: "  " }, host)).error?.code).toBe("INVALID_PARAMS");
    expect((await call("add_review_note", { t: -3, text: "x" }, host)).error?.code).toBe("INVALID_PARAMS");
  });
});

describe("wait_for_review_send", () => {
  it("returns at once for an unseen Send, then waits from the cursor", async () => {
    let review = addNote(getReview({}), { t: 2, text: "x" }).state;
    review = sendNotesToClaude(review);
    let waited: { since?: string; ms: number } | undefined;
    const host = Object.assign(reviewHost({ ...makeProjectWithClip(), review }), {
      async waitForReviewEvent(since: string | undefined, ms: number) {
        waited = { since, ms };
        return null;
      },
    });
    const first = await call("wait_for_review_send", {}, host);
    expect(first.data).toMatchObject({ event: "send" });
    const cursor = (first.data as { cursor: string }).cursor;
    expect(waited).toBeUndefined();

    const second = await call("wait_for_review_send", { since: cursor, timeoutSec: 999 }, host);
    expect(second.data).toMatchObject({ event: "timeout", cursor });
    expect(waited).toEqual({ since: cursor, ms: 110_000 });
  });

  it("is read-only, unlocked and UNSUPPORTED without a wait method", async () => {
    expect(getTool("wait_for_review_send")?.readOnly).toBe(true);
    expect(DLTCAFE_UNLOCKED_TOOLS.has("wait_for_review_send")).toBe(true);
    const res = await call("wait_for_review_send", {}, new HeadlessHost(makeEmptyProject()));
    expect(res.error?.code).toBe("UNSUPPORTED");
  });
});
