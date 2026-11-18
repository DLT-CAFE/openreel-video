import "../../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Project } from "@openreel/core";
import { createEmptyProject } from "../../../stores/project/project-helpers";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { InspectorPanel } from "../InspectorPanel";
import { useInspectorV2Flag } from "./flag";
import { V2_TABS, locateSection, topTabsFor } from "./tab-map";
import { toggleTransformKeyframe, transformKeyframeTimes } from "./actions";

const clipId = "clip-vid";
const trackId = "track-vid";

function seedClip(opts: {
  mediaId: string;
  trackType: "video" | "audio" | "image";
}): Project {
  const project = createEmptyProject("Inspector Sections Test");
  const mediaType = opts.trackType;
  const seeded: Project = {
    ...project,
    mediaLibrary: {
      items: [
        {
          id: opts.mediaId,
          name: opts.mediaId,
          type: mediaType,
          fileHandle: null,
          blob: null,
          metadata: {
            duration: 10,
            width: mediaType === "audio" ? 0 : 1920,
            height: mediaType === "audio" ? 0 : 1080,
            frameRate: mediaType === "audio" ? 0 : 30,
            codec: mediaType === "audio" ? "aac" : "h264",
            sampleRate: mediaType === "image" ? 0 : 48_000,
            channels: mediaType === "image" ? 0 : 2,
            fileSize: 1,
          },
          thumbnailUrl: null,
          waveformData: null,
        },
      ],
    },
    timeline: {
      ...project.timeline,
      duration: 10,
      tracks: [
        {
          id: trackId,
          type: opts.trackType,
          name: "Track",
          clips: [
            {
              id: clipId,
              mediaId: opts.mediaId,
              trackId,
              startTime: 0,
              duration: 10,
              inPoint: 0,
              outPoint: 10,
              effects: [],
              audioEffects: [],
              transform: {
                position: { x: 0, y: 0 },
                scale: { x: 1, y: 1 },
                rotation: 0,
                anchor: { x: 0.5, y: 0.5 },
                opacity: 1,
              },
              volume: 1,
              keyframes: [],
            },
          ],
          transitions: [],
          locked: false,
          hidden: false,
          muted: false,
          solo: false,
        },
      ],
    },
  };
  useProjectStore.setState({ project: seeded });
  useUIStore.getState().select({ type: "clip", id: clipId, trackId });
  return seeded;
}


const tabNames = () => within(screen.getByRole("tablist", { name: "Inspector sections" })).getAllByRole("tab").map((t) => t.textContent);

describe("Inspector V2 tab map", () => {
  it("puts every known section key in exactly one sub-tab and routes unknown keys home", () => {
    const seen = new Map<string, string>();
    for (const t of V2_TABS) for (const s of t.subs) for (const k of s.keys) {
      expect(seen.has(k), k).toBe(false);
      seen.set(k, `${t.id}/${s.id}`);
    }
    expect(locateSection("speed-curves", "speed")).toEqual({ top: "speed", sub: "curve" });
    expect(locateSection("something-new", "audio")).toEqual({ top: "audio", sub: "basic" });
  });

  it("chooses top tabs from the clip's old tab list", () => {
    expect(topTabsFor(["transform", "color", "effects", "audio", "speed", "animate", "ai"]).map((t) => t.id)).toEqual(["video", "audio", "speed", "animation", "adjust", "ai"]);
    expect(topTabsFor(["audio", "ai"]).map((t) => t.id)).toEqual(["audio", "ai"]);
    expect(topTabsFor(["transform", "style", "effects", "animate"]).map((t) => t.id)).toEqual(["style", "video", "animation"]);
  });
});

describe("InspectorPanel V2", () => {
  beforeEach(() => useInspectorV2Flag.setState({ enabled: true }));
  afterEach(() => {
    cleanup();
    useUIStore.getState().clearSelection();
    useProjectStore.setState({ project: createEmptyProject("Reset") });
  });

  it("shows CapCut-style top tabs and sub-tabs for a video clip, filtering sections", () => {
    seedClip({ mediaId: "media-vid", trackType: "video" });
    const { container } = render(<InspectorPanel />);
    expect(screen.getByTestId("inspector-v2")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Video" }));
    expect(tabNames()).toEqual(["Video", "Audio", "Speed", "Animation", "Adjust", "AI"]);
    expect(within(screen.getByRole("tablist", { name: "Video options" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Basic", "Remove BG", "Mask", "Tracking", "More"]);
    expect(container.querySelector('[data-section-id="transform"]')).not.toBeNull();
    expect(container.querySelector('[data-section-id="clip-audio"]')).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Audio" }));
    expect(container.querySelector('[data-section-id="transform"]')).toBeNull();
    expect(container.querySelector('[data-section-id="clip-audio"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Speed" }));
    fireEvent.click(screen.getByRole("tab", { name: "Curve" }));
    expect(container.querySelector('[data-section-id="speed-curves"]')).not.toBeNull();
    expect(container.querySelector('[data-section-id="speed"]')).toBeNull();
  });

  it("has a sticky footer and can switch back to the classic inspector", () => {
    seedClip({ mediaId: "media-vid", trackType: "video" });
    render(<InspectorPanel />);
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply to all" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save as preset" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "More inspector options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Use classic inspector" }));
    expect(screen.queryByTestId("inspector-v2")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try the new inspector/ }));
    expect(screen.getByTestId("inspector-v2")).toBeTruthy();
  });

  it("an audio clip gets Audio and AI tabs only", () => {
    seedClip({ mediaId: "media-audio", trackType: "audio" });
    render(<InspectorPanel />);
    expect(tabNames()).toEqual(["Audio", "AI"]);
  });

  it("toggles transform keyframes at the playhead and lists their times", () => {
    seedClip({ mediaId: "media-vid", trackType: "video" });
    useTimelineStore.setState({ playheadPosition: 2 });
    expect(toggleTransformKeyframe(clipId, 2)).toBe("added");
    const clip = useProjectStore.getState().getClip(clipId);
    expect(clip?.keyframes).toHaveLength(6);
    expect(transformKeyframeTimes(clip)).toEqual([2]);
    render(<InspectorPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "Video" })); // the last-used tab is remembered
    fireEvent.click(screen.getByRole("tab", { name: "Basic" }));
    expect(screen.getByRole("button", { name: "Remove transform keyframe at playhead" })).toBeTruthy();
    expect(toggleTransformKeyframe(clipId, 2)).toBe("removed");
    expect(useProjectStore.getState().getClip(clipId)?.keyframes).toHaveLength(0);
  });
});
