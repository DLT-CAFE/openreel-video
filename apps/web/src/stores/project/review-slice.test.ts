import { describe, it, expect } from "vitest";
import { create } from "zustand";
import type { Project } from "@openreel/core";
import { getReview } from "@openreel/review";
import { createReviewSlice, type ReviewSlice } from "./review-slice";
import type { ProjectState } from "../project-store";

type Mini = Pick<ProjectState, "project" | "hasOpenProject"> & ReviewSlice;

function makeStore(hasOpenProject = true) {
  const project = { id: "p", name: "P", modifiedAt: 0, mediaLibrary: { items: [] }, timeline: { tracks: [], markers: [], subtitles: [], duration: 0 } } as unknown as Project;
  return create<Mini>()((set, get) => ({
    project,
    hasOpenProject,
    ...createReviewSlice(set as never, get as never),
  }));
}

describe("review slice", () => {
  it("stores notes on project.review and replaces the project object (autosave sees it)", () => {
    const store = makeStore();
    const before = store.getState().project;
    const note = store.getState().addReviewNote({ t: 4.2, text: "louder VO" });
    const after = store.getState().project;
    expect(after).not.toBe(before);
    expect(after.modifiedAt).toBeGreaterThan(0);
    expect(getReview(after).notes[0]).toMatchObject({ id: note.id, text: "louder VO", author: "user" });
  });

  it("runs reply / done / send / approve / reopen / delete", () => {
    const store = makeStore();
    const s = () => store.getState();
    const note = s().addReviewNote({ t: 1, text: "a" });
    s().replyReviewNote(note.id, "and b");
    expect(s().getReviewState().notes[0].replies[0]).toMatchObject({ author: "user", text: "and b" });
    s().sendReviewToClaude();
    expect(s().getReviewState().approval.status).toBe("changes_requested");
    s().setReviewNoteStatus(note.id, "done");
    s().approveReview();
    expect(s().getReviewState().approval.status).toBe("approved");
    s().reopenReview();
    expect(s().getReviewState().approval.status).toBe("draft");
    s().editReviewNote(note.id, { text: "edited" });
    expect(s().getReviewState().notes[0].text).toBe("edited");
    s().deleteReviewNote(note.id);
    expect(s().getReviewState().notes).toHaveLength(0);
  });

  it("refuses changes with no open project and bad input", () => {
    expect(() => makeStore(false).getState().addReviewNote({ t: 1, text: "x" })).toThrow(/No project/);
    expect(() => makeStore().getState().addReviewNote({ t: 1, text: "" })).toThrow(/empty/);
    expect(() => makeStore().getState().sendReviewToClaude()).toThrow(/no open notes/);
  });
});
