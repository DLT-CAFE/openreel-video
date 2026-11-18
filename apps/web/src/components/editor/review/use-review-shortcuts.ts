// DLT Cafe: N adds a review note at the playhead.
// N is also OpenReel's "Toggle snap" shortcut, so plain N only takes over
// while the Review dock is open; Shift+N works anywhere and opens the dock.
// Ignored while typing in a field, in dialogs, or with Cmd/Ctrl/Alt held.
import { useEffect } from "react";
import { useTimelineStore } from "../../../stores/timeline-store";
import { getPlaybackBridge } from "../../../bridges/playback-bridge";
import { useReviewUIStore } from "./review-ui-store";

const TYPING =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [data-editor-shortcuts="off"], [role="dialog"], [role="alertdialog"]';

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(TYPING);
}

/** Returns true when the event should add a review note. */
export function isAddNoteKey(e: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing">, dockOpen: boolean): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return false;
  if (e.code !== "KeyN" && e.key.toLowerCase() !== "n") return false;
  return e.shiftKey || dockOpen;
}

export function addNoteAtPlayhead(): void {
  const t = useTimelineStore.getState().playheadPosition;
  try {
    getPlaybackBridge().pause();
  } catch {
    useTimelineStore.getState().pause?.();
  }
  useReviewUIStore.getState().startNoteAt(t);
}

export function useReviewShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = (e.composedPath?.()[0] as EventTarget | undefined) ?? e.target;
      if (isTypingTarget(target)) return;
      if (document.querySelector('[aria-modal="true"]:not([data-state="closed"])')) return;
      if (!isAddNoteKey(e, useReviewUIStore.getState().open)) return;
      e.preventDefault();
      e.stopPropagation(); // keep N from also toggling snap
      addNoteAtPlayhead();
    };
    // Capture phase so we run before the editor's shortcut manager.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
