import { describe, it, expect } from "vitest";
import type { Project } from "@openreel/core/types/project";
import { clipAtTime, describeAnchor, getReview, withReview } from "./project";
import { EMPTY_REVIEW, addNote } from "./model";

const clip = (id: string, trackId: string, startTime: number, duration: number, inPoint = 0) =>
  ({ id, mediaId: `m-${id}`, trackId, startTime, duration, inPoint, outPoint: inPoint + duration, effects: [], audioEffects: [], keyframes: [], volume: 1, transform: {} });
const project = {
  id: "p", name: "p", modifiedAt: 0,
  mediaLibrary: { items: [{ id: "m-top", name: "top.mp4" }, { id: "m-low", name: "low.mp4" }, { id: "m-aud", name: "vo.wav" }] },
  timeline: {
    tracks: [
      { id: "V2", name: "V2", type: "video", hidden: false, clips: [clip("top", "V2", 10, 5, 2)] },
      { id: "V1", name: "V1", type: "video", hidden: false, clips: [clip("low", "V1", 0, 20)] },
      { id: "A1", name: "A1", type: "audio", hidden: false, clips: [clip("aud", "A1", 30, 5)] },
    ],
  },
} as unknown as Project;

describe("review on a project", () => {
  it("reads an empty review from a project without one and writes it back", () => {
    expect(getReview(project)).toEqual(EMPTY_REVIEW);
    const { state } = addNote(EMPTY_REVIEW, { t: 1, text: "x" });
    const next = withReview(project, state);
    expect(getReview(next).notes).toHaveLength(1);
    expect(project.review).toBeUndefined();
  });

  it("finds the visible clip at a time, top track first", () => {
    expect(clipAtTime(project, 12)).toMatchObject({ clipId: "top", mediaName: "top.mp4", sourceTime: 4 });
    expect(clipAtTime(project, 5)).toMatchObject({ clipId: "low" });
    expect(clipAtTime(project, 31)).toMatchObject({ clipId: "aud" });
    expect(clipAtTime(project, 50)).toBeUndefined();
  });

  it("describes a note's anchor even if the clip moved, or flags it missing", () => {
    const { note } = addNote(EMPTY_REVIEW, { t: 11, text: "x", clipId: "top" });
    expect(describeAnchor(project, note)).toMatchObject({ clipId: "top", sourceTime: 3 });
    const { note: gone } = addNote(EMPTY_REVIEW, { t: 11, text: "x", clipId: "deleted" });
    expect(describeAnchor(project, gone)).toEqual({ clipId: "deleted", missing: true });
  });
});
