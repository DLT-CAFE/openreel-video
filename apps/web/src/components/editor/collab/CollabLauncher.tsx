// DLT Cafe M3: floating button that opens the Collaborate panel (bottom-right
// of the viewer), with a badge for open review notes.
import React, { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { useCollabStore } from "./collab-store";

export const CollabLauncher: React.FC = () => {
  const { open, openPanel, tab } = useCollabStore();
  const review = useProjectStore((s) => s.project?.review);
  const openNotes = useMemo(() => getReview({ review }).notes.filter((n) => n.status === "open").length, [review]);
  if (open) return null;
  const label = `AI & notes${openNotes ? ` (${openNotes} open notes)` : ""}`;
  return (
    <button
      type="button"
      aria-label={label}
      title="Chat with the AI and leave notes (Shift+N for a note)"
      data-testid="collab-launcher"
      onClick={() => openPanel(openNotes && tab !== "chat" ? "notes" : tab)}
      className="absolute bottom-24 right-4 z-30 flex h-11 items-center gap-2 rounded-full border border-border-strong bg-bg-1 pl-3 pr-4 text-[13px] font-semibold text-fg shadow-lg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-fg">
        <Sparkles size={15} aria-hidden />
      </span>
      AI &amp; notes
      {openNotes > 0 && (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-black">{openNotes}</span>
      )}
    </button>
  );
};
