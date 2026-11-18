// DLT Cafe: review-note pins on the timeline (same positioning as MarkerIndicator).
import React, { useMemo } from "react";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { getPlaybackBridge } from "../../../bridges/playback-bridge";
import { formatReviewTime, useReviewUIStore } from "./review-ui-store";

export const ReviewNotePins: React.FC<{ pixelsPerSecond: number; scrollX: number }> = ({ pixelsPerSecond, scrollX }) => {
  const review = useProjectStore((s) => s.project.review);
  const notes = useMemo(() => getReview({ review }).notes, [review]);
  const focused = useReviewUIStore((s) => s.focusedNoteId);
  const focusNote = useReviewUIStore((s) => s.focusNote);
  if (notes.length === 0) return null;
  return (
    <>
      {notes.map((note) => {
        const x = note.t * pixelsPerSecond - scrollX;
        const width = note.t1 !== undefined ? Math.max(2, (note.t1 - note.t) * pixelsPerSecond) : 2;
        const open = note.status === "open";
        return (
          <div key={note.id} className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: `${x}px`, width }}>
            <div className={`h-full ${open ? "bg-amber-400/30" : "bg-emerald-500/15"} ${note.t1 === undefined ? "w-px" : ""}`} />
            <button
              type="button"
              data-testid="review-pin"
              className={`pointer-events-auto absolute -left-[7px] top-0.5 h-3.5 w-3.5 rounded-full rounded-bl-none border text-[0px] shadow ${
                open ? "border-amber-600 bg-amber-400" : "border-emerald-700 bg-emerald-500"
              } ${focused === note.id ? "ring-2 ring-accent" : ""}`}
              title={`${formatReviewTime(note.t)} ${note.text}`}
              aria-label={`Review note at ${formatReviewTime(note.t)}: ${note.text}`}
              onClick={(e) => {
                e.stopPropagation();
                focusNote(note.id);
                try { getPlaybackBridge().scrubTo(note.t); } catch { /* preview not ready */ }
              }}
            >
              note
            </button>
          </div>
        );
      })}
    </>
  );
};
