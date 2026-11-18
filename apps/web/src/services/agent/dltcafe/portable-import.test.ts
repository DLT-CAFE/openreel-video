import { describe, it, expect } from "vitest";
import type { PortableEdit } from "@openreel/core/editing/portable-project";
import { resolveMediaDir, remapMediaIds, clampToDecodedDurations } from "./portable-import";

const clip = (id: string, mediaId: string, inPoint: number, outPoint: number) => ({
  id, mediaId, trackId: "t1", startTime: 0, duration: outPoint - inPoint, inPoint, outPoint,
  effects: [], audioEffects: [], keyframes: [], volume: 1,
  transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1 },
});
const doc = (): PortableEdit => ({
  format: "openreel-edit", version: 2,
  project: {
    id: "p", name: "n", settings: { width: 1920, height: 1080, frameRate: 24, sampleRate: 48000, channels: 2 },
    media: [{ id: "a", name: "a.mp4", type: "video", metadata: { duration: 10, width: 1, height: 1, frameRate: 24, codec: "", sampleRate: 0, channels: 0, fileSize: 1 } }],
    timeline: { tracks: [{ id: "t1", name: "V1", type: "video", locked: false, hidden: false, muted: false, solo: false, transitions: [], clips: [clip("c1", "a", 1, 9.9), clip("c2", "a", 0, 9.5)] }], subtitles: [], markers: [], duration: 10 },
    textClips: [],
  },
} as unknown as PortableEdit);

describe("portable import helpers", () => {
  it("resolves mediaDir against the JSON folder", () => {
    expect(resolveMediaDir("/r/e/x.json")).toBe("/r/e");
    expect(resolveMediaDir("/r/e/x.json", "../m/")).toBe("/r/e/../m");
    expect(resolveMediaDir("/r/e/x.json", "/abs")).toBe("/abs");
    expect(resolveMediaDir("/r/e/x.json", "~/DLT-Cafe/m")).toBe("~/DLT-Cafe/m");
  });

  it("remaps media ids on media and clips", () => {
    const out = remapMediaIds(doc(), new Map([["a", "lib-1"]]));
    expect(out.project.media[0].id).toBe("lib-1");
    expect(out.project.timeline.tracks[0].clips.map((c) => c.mediaId)).toEqual(["lib-1", "lib-1"]);
  });

  it("trims clips that overrun decoded media slightly, leaves big overruns", () => {
    const small = clampToDecodedDurations(doc(), new Map([["a", 9.7]]));
    expect(small.clamped).toBe(1);
    expect(small.doc.project.timeline.tracks[0].clips[0]).toMatchObject({ outPoint: 9.7, duration: 9.7 - 1 });
    const big = clampToDecodedDurations(doc(), new Map([["a", 9.0]]));
    expect(big.clamped).toBe(0);
  });
});
