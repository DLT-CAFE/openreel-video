// DLT Cafe M4: Inspector V2 tab layout (CapCut-like grouping, our own design).
// Top tabs group the existing inspector sections; sub-tabs pick sections by
// their sectionId (or title when a section has no id). Section components
// are reused unchanged.
import type { InspectorTabId } from "../inspector/clip-tabs.config";

export type V2TopId = "style" | "video" | "audio" | "speed" | "animation" | "adjust" | "ai";

export interface V2SubTab {
  readonly id: string;
  readonly label: string;
  /** Section keys (sectionId, else title) shown on this sub-tab. */
  readonly keys: readonly string[];
}

export interface V2TopTab {
  readonly id: V2TopId;
  readonly label: string;
  /** Old inspector tab components whose sections live here. */
  readonly slots: readonly InspectorTabId[];
  readonly subs: readonly V2SubTab[];
}

export const V2_TABS: readonly V2TopTab[] = [
  {
    id: "style", label: "Text", slots: ["style"],
    subs: [{ id: "style", label: "Style", keys: ["text-properties", "shape-properties", "SVG Properties"] }],
  },
  {
    id: "video", label: "Video", slots: ["transform", "effects"],
    subs: [
      { id: "basic", label: "Basic", keys: ["transform", "alignment", "transform-3d", "crop", "Crop", "pip"] },
      { id: "remove-bg", label: "Remove BG", keys: ["background-removal", "Background Removal", "green-screen", "Chroma Key (Green Screen)", "text-behind-subject"] },
      { id: "mask", label: "Mask", keys: ["masking", "Masking"] },
      { id: "track", label: "Tracking", keys: ["motion-tracking", "Motion Tracking"] },
      { id: "more", label: "More", keys: ["Nested Sequences", "Adjustment Layers", "multicam"] },
    ],
  },
  {
    id: "audio", label: "Audio", slots: ["audio"],
    subs: [
      { id: "basic", label: "Basic", keys: ["clip-audio", "Clip Audio", "voice-over", "Voice Over"] },
      { id: "noise", label: "Noise", keys: ["background-noise-removal", "auto-cut-silence"] },
      { id: "effects", label: "Effects", keys: ["audio-effects"] },
      { id: "ducking", label: "Ducking", keys: ["audio-ducking", "beat-sync", "Beat Sync"] },
    ],
  },
  {
    id: "speed", label: "Speed", slots: ["speed"],
    subs: [
      { id: "standard", label: "Standard", keys: ["speed"] },
      { id: "curve", label: "Curve", keys: ["speed-curves"] },
      { id: "stabilize", label: "Stabilize", keys: ["stabilization"] },
    ],
  },
  {
    id: "animation", label: "Animation", slots: ["animate"],
    subs: [
      { id: "presets", label: "Presets", keys: ["motion-presets", "transitions"] },
      { id: "keyframes", label: "Keyframes", keys: ["keyframes", "Keyframes"] },
      { id: "path", label: "Path", keys: ["motion-path"] },
      { id: "emphasis", label: "Emphasis", keys: ["emphasis-animation", "text-animation"] },
    ],
  },
  {
    id: "adjust", label: "Adjust", slots: ["color", "effects"],
    subs: [
      { id: "color", label: "Color", keys: ["color-grading"] },
      { id: "effects", label: "Effects", keys: ["video-effects", "Video Effects", "applied-effects"] },
      { id: "particles", label: "Particles", keys: ["particle-effects"] },
    ],
  },
  {
    id: "ai", label: "AI", slots: ["ai"],
    subs: [{ id: "all", label: "AI tools", keys: ["auto-captions", "editable-captions", "auto-reframe", "auto-edit", "ai-highlights"] }],
  },
];

/** Where each old tab's loose (non-section) content and unmapped sections go. */
export const SLOT_HOME: Record<InspectorTabId, { top: V2TopId; sub: string }> = {
  style: { top: "style", sub: "style" },
  transform: { top: "video", sub: "basic" },
  effects: { top: "adjust", sub: "effects" },
  color: { top: "adjust", sub: "color" },
  audio: { top: "audio", sub: "basic" },
  speed: { top: "speed", sub: "standard" },
  animate: { top: "animation", sub: "presets" },
  ai: { top: "ai", sub: "all" },
};

const KEY_INDEX = new Map<string, { top: V2TopId; sub: string }>();
for (const t of V2_TABS) for (const s of t.subs) for (const k of s.keys) if (!KEY_INDEX.has(k)) KEY_INDEX.set(k, { top: t.id, sub: s.id });

/** The (top, sub) a section key belongs to; unmapped keys go to the slot's home. */
export function locateSection(key: string | undefined, slot: InspectorTabId): { top: V2TopId; sub: string } {
  return (key && KEY_INDEX.get(key)) || SLOT_HOME[slot];
}

/** Top tabs available for a clip, from the old per-clip-type tab list. */
export function topTabsFor(oldTabIds: readonly InspectorTabId[]): V2TopTab[] {
  return V2_TABS.filter((t) => {
    if (t.id === "video") return oldTabIds.includes("transform");
    if (t.id === "adjust") return oldTabIds.includes("color") || (oldTabIds.includes("effects") && !oldTabIds.includes("style"));
    return t.slots.some((s) => oldTabIds.includes(s));
  }).map((t) => (t.id === "style" && oldTabIds.includes("style") ? t : t));
}
