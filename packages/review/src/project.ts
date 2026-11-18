// Ties ReviewState to an OpenReel Project. Notes live on `project.review`,
// so they are saved, autosaved and exported with the project in both the
// browser and the desktop app without any extra storage.
import type { Project } from "@openreel/core/types/project";
import { normalizeReview, type ReviewNote, type ReviewState } from "./model";

declare module "@openreel/core/types/project" {
  interface Project {
    /** DLT Cafe review layer (packages/review). Not part of undo history. */
    readonly review?: ReviewState;
  }
}

export function getReview(project: Pick<Project, "review">): ReviewState {
  return normalizeReview(project.review);
}

export function withReview<P extends Project>(project: P, review: ReviewState): P {
  return { ...project, review, modifiedAt: Date.now() };
}

export interface ClipAtTime {
  readonly clipId: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly mediaId: string;
  readonly mediaName?: string;
  readonly clipStart: number;
  readonly clipEnd: number;
  /** Source-media time at `t` (inPoint + offset * speed). */
  readonly sourceTime: number;
}

/**
 * The clip a viewer sees at time t: the top-most visible video/image track
 * with a clip there (tracks[0] is the front), else any clip under t.
 */
export function clipAtTime(project: Project, t: number): ClipAtTime | undefined {
  const media = new Map(project.mediaLibrary.items.map((m) => [m.id, m.name]));
  const hit = (visualOnly: boolean): ClipAtTime | undefined => {
    for (const track of project.timeline.tracks) {
      if (track.hidden) continue;
      if (visualOnly && track.type !== "video" && track.type !== "image") continue;
      for (const clip of track.clips) {
        if (t >= clip.startTime && t < clip.startTime + clip.duration) {
          return {
            clipId: clip.id,
            trackId: track.id,
            trackName: track.name,
            mediaId: clip.mediaId,
            mediaName: media.get(clip.mediaId),
            clipStart: clip.startTime,
            clipEnd: clip.startTime + clip.duration,
            sourceTime: Math.round((clip.inPoint + (t - clip.startTime) * (clip.speed ?? 1)) * 1000) / 1000,
          };
        }
      }
    }
    return undefined;
  };
  return hit(true) ?? hit(false);
}

/** Where a note's anchor clip is now (it may have moved since the note was left). */
export function describeAnchor(project: Project, note: ReviewNote): ClipAtTime | { readonly clipId: string; readonly missing: true } | undefined {
  if (!note.clipId) return clipAtTime(project, note.t);
  const media = new Map(project.mediaLibrary.items.map((m) => [m.id, m.name]));
  for (const track of project.timeline.tracks) {
    const clip = track.clips.find((c) => c.id === note.clipId);
    if (clip) {
      const local = Math.min(Math.max(note.t - clip.startTime, 0), clip.duration);
      return {
        clipId: clip.id,
        trackId: track.id,
        trackName: track.name,
        mediaId: clip.mediaId,
        mediaName: media.get(clip.mediaId),
        clipStart: clip.startTime,
        clipEnd: clip.startTime + clip.duration,
        sourceTime: Math.round((clip.inPoint + local * (clip.speed ?? 1)) * 1000) / 1000,
      };
    }
  }
  return { clipId: note.clipId, missing: true };
}
