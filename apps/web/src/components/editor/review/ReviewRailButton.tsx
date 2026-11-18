// DLT Cafe: rail button that opens the review panel, with an open-note badge.
import React, { useMemo } from "react";
import { MessageSquareText } from "lucide-react";
import { ToolcraftIconButton as IconButton, ToolcraftTooltip as Tooltip } from "@openreel/ui";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { useReviewUIStore } from "./review-ui-store";

export const ReviewRailButton: React.FC = () => {
  const review = useProjectStore((s) => s.project?.review);
  const open = useMemo(() => getReview({ review }).notes.filter((n) => n.status === "open").length, [review]);
  const { open: visible, toggle } = useReviewUIStore();
  const label = `Review notes${open ? ` (${open} open)` : ""}`;
  return (
    <Tooltip content={label} placement="end">
      <span className="relative inline-flex">
        <IconButton
          label={label}
          icon={<MessageSquareText size={16} aria-hidden />}
          size="sm"
          variant={visible ? "secondary" : "ghost"}
          onClick={toggle}
        />
        {open > 0 && (
          <span aria-hidden className="pointer-events-none absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-amber-400 px-0.5 text-[9px] font-bold text-black">
            {open > 99 ? "99+" : open}
          </span>
        )}
      </span>
    </Tooltip>
  );
};
