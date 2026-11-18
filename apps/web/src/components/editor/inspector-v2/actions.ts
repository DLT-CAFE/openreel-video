// DLT Cafe M4: Inspector V2 footer + keyframe actions, using existing store APIs.
import type { Clip, Keyframe } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { toast } from "../../../stores/notification-store";
import { getPlaybackBridge } from "../../../bridges/playback-bridge";

export const TRANSFORM_KEYFRAME_PROPS = ["position.x", "position.y", "scale.x", "scale.y", "rotation", "opacity"] as const;
const EPS = 0.01;

export function transformKeyframeTimes(clip: Clip | undefined): number[] {
  const times = (clip?.keyframes ?? [])
    .filter((k) => (TRANSFORM_KEYFRAME_PROPS as readonly string[]).includes(k.property))
    .map((k) => k.time)
    .sort((a, b) => a - b);
  return times.filter((t, i) => i === 0 || Math.abs(t - times[i - 1]) > EPS);
}

function currentTransformValues(clip: Clip): Record<(typeof TRANSFORM_KEYFRAME_PROPS)[number], number> {
  const t = clip.transform;
  return {
    "position.x": t.position.x, "position.y": t.position.y,
    "scale.x": t.scale.x, "scale.y": t.scale.y,
    rotation: t.rotation, opacity: t.opacity,
  };
}

/** Add transform keyframes at the playhead, or remove them if present. Returns the new state. */
export function toggleTransformKeyframe(clipId: string, playhead: number): "added" | "removed" | "none" {
  const store = useProjectStore.getState();
  const clip = store.getClip(clipId);
  if (!clip) return "none";
  const kfs = clip.keyframes ?? [];
  const isTransform = (k: Keyframe) => (TRANSFORM_KEYFRAME_PROPS as readonly string[]).includes(k.property);
  const here = kfs.filter((k) => isTransform(k) && Math.abs(k.time - playhead) < EPS);
  if (here.length) {
    store.updateClipKeyframes(clipId, kfs.filter((k) => !here.includes(k)));
    return "removed";
  }
  const values = currentTransformValues(clip);
  const added: Keyframe[] = TRANSFORM_KEYFRAME_PROPS.map((property) => ({
    id: `kf-${Date.now().toString(36)}-${property}-${Math.random().toString(36).slice(2, 6)}`,
    time: playhead,
    property,
    value: values[property],
    easing: "linear",
  }));
  store.updateClipKeyframes(clipId, [...kfs, ...added].sort((a, b) => a.time - b.time));
  return "added";
}

export function seek(t: number): void {
  try { getPlaybackBridge().scrubTo(t); } catch { useTimelineStore.getState().seekTo(t); }
}

/** Video "Reset": back to the default basic transform. */
export async function resetTransform(clipId: string): Promise<void> {
  await useProjectStore.getState().updateClipTransform(clipId, {
    position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0, anchor: { x: 0.5, y: 0.5 }, opacity: 1,
  });
  toast.success("Inspector", "Transform reset");
}

/** Targets for "Apply to all": other selected clips, else every other clip on the same track. */
export function applyTargets(clipId: string): string[] {
  const { project } = useProjectStore.getState();
  const selected = useUIStore.getState().selectedItems.filter((i) => i.type === "clip").map((i) => i.id).filter((id) => id !== clipId);
  if (selected.length) return selected;
  const track = project.timeline.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  return track ? track.clips.map((c) => c.id).filter((id) => id !== clipId) : [];
}

/** Copy this clip's look (transform for Video, effects for Adjust) to the targets. */
export async function applyToAll(clipId: string, what: "transform" | "effects"): Promise<number> {
  const store = useProjectStore.getState();
  const clip = store.getClip(clipId);
  if (!clip) return 0;
  const targets = applyTargets(clipId);
  if (what === "transform") {
    const { position, scale, rotation, anchor, opacity } = clip.transform;
    for (const id of targets) await store.updateClipTransform(id, { position, scale, rotation, anchor, opacity });
  } else {
    store.copyEffects(clipId);
    for (const id of targets) await store.pasteEffects(id);
  }
  toast.success("Inspector", `Applied to ${targets.length} clip${targets.length === 1 ? "" : "s"}`);
  return targets.length;
}

const PRESETS_KEY = "dltcafe-presets";

/** Save this clip's effects as an `openreel-preset` (kept in this browser and copied to the clipboard). */
export async function savePreset(clipId: string, name: string): Promise<boolean> {
  const clip = useProjectStore.getState().getClip(clipId);
  if (!clip) return false;
  if (!clip.effects?.length) {
    toast.info("Save as preset", "This clip has no effects to save yet.");
    return false;
  }
  const preset = { format: "openreel-preset", version: 1, name: name.trim().slice(0, 80) || "My look", effects: clip.effects };
  try {
    const list = JSON.parse(localStorage.getItem(PRESETS_KEY) ?? "[]") as unknown[];
    localStorage.setItem(PRESETS_KEY, JSON.stringify([...(Array.isArray(list) ? list : []), preset].slice(-100)));
  } catch { /* storage unavailable */ }
  try { await navigator.clipboard?.writeText(JSON.stringify(preset, null, 2)); } catch { /* clipboard blocked */ }
  toast.success("Preset saved", `"${preset.name}" saved and copied as JSON (paste it in AI chat › Edit JSON & presets to apply).`);
  return true;
}
