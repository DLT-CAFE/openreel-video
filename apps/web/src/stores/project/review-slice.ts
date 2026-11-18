// DLT Cafe: review notes slice (packages/review). Notes live on
// project.review, so they save/autosave/export with the project in the
// browser and desktop app alike. Changes skip undo history on purpose:
// undoing an edit must not remove the person's notes.
import type { StoreApi } from "zustand";
import {
  addNote,
  approve,
  deleteNote,
  editNote,
  getReview,
  reopenReview,
  replyToNote,
  sendNotesToClaude,
  setNoteStatus,
  withReview,
  type AddNoteInput,
  type ReviewNote,
  type ReviewNoteStatus,
  type ReviewState,
} from "@openreel/review";
import type { Project } from "@openreel/core";
import type { ProjectState } from "../project-store";

type Get = StoreApi<ProjectState>["getState"];
type Set = StoreApi<ProjectState>["setState"];

export interface ReviewSlice {
  getReviewState: () => ReviewState;
  /** Apply a pure update to the open project's review. Throws ReviewError on bad input. */
  updateReview: (update: (review: ReviewState, project: Project) => ReviewState) => ReviewState;
  addReviewNote: (input: AddNoteInput) => ReviewNote;
  editReviewNote: (noteId: string, patch: { text?: string; t?: number; t1?: number | null; clipId?: string | null }) => void;
  deleteReviewNote: (noteId: string) => void;
  replyReviewNote: (noteId: string, text: string, status?: ReviewNoteStatus) => void;
  setReviewNoteStatus: (noteId: string, status: ReviewNoteStatus) => void;
  sendReviewToClaude: () => void;
  /** applyToBatch: carry this video's notes to the rest of its batch (Edit Review's checkbox). */
  approveReview: (applyToBatch?: boolean) => void;
  reopenReview: () => void;
}

export function createReviewSlice(set: Set, get: Get): ReviewSlice {
  const updateReview: ReviewSlice["updateReview"] = (update) => {
    const { project, hasOpenProject } = get();
    if (!hasOpenProject) throw new Error("No project is open");
    const next = update(getReview(project), project);
    set({ project: withReview(project, next) });
    return next;
  };
  return {
    getReviewState: () => getReview(get().project),
    updateReview,
    addReviewNote: (input) => {
      let note!: ReviewNote;
      updateReview((r) => {
        const out = addNote(r, input);
        note = out.note;
        return out.state;
      });
      return note;
    },
    editReviewNote: (noteId, patch) => void updateReview((r) => editNote(r, noteId, patch)),
    deleteReviewNote: (noteId) => void updateReview((r) => deleteNote(r, noteId)),
    replyReviewNote: (noteId, text, status) =>
      void updateReview((r) => replyToNote(r, noteId, { text, author: "user", ...(status ? { status } : {}) }).state),
    setReviewNoteStatus: (noteId, status) => void updateReview((r) => setNoteStatus(r, noteId, status)),
    sendReviewToClaude: () => void updateReview((r) => sendNotesToClaude(r)),
    approveReview: (applyToBatch) => void updateReview((r) => approve(r, undefined, { applyToBatch })),
    reopenReview: () => void updateReview((r) => reopenReview(r)),
  };
}
