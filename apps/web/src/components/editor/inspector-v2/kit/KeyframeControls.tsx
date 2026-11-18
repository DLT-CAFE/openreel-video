// DLT Cafe M4 kit: ◀ ◆ ▶ keyframe control. Diamond filled when a keyframe
// exists at the playhead; arrows jump the playhead to the previous/next one.
import React from "react";
import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";

export interface KeyframeControlsProps {
  label: string;
  hasKeyframeHere: boolean;
  canPrev: boolean;
  canNext: boolean;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
}

const btn = "grid h-7 w-6 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-30 disabled:hover:bg-transparent";

export const KeyframeControls: React.FC<KeyframeControlsProps> = ({ label, hasKeyframeHere, canPrev, canNext, onToggle, onPrev, onNext }) => (
  <div className="flex shrink-0 items-center" role="group" aria-label={`${label} keyframes`}>
    <button type="button" className={btn} aria-label={`Previous ${label} keyframe`} disabled={!canPrev} onClick={onPrev}><ChevronLeft size={14} aria-hidden /></button>
    <button
      type="button"
      className={`${btn} ${hasKeyframeHere ? "text-accent" : ""}`}
      aria-label={hasKeyframeHere ? `Remove ${label} keyframe at playhead` : `Add ${label} keyframe at playhead`}
      aria-pressed={hasKeyframeHere}
      onClick={onToggle}
    >
      <Diamond size={13} aria-hidden fill={hasKeyframeHere ? "currentColor" : "none"} />
    </button>
    <button type="button" className={btn} aria-label={`Next ${label} keyframe`} disabled={!canNext} onClick={onNext}><ChevronRight size={14} aria-hidden /></button>
  </div>
);
