// DLT Cafe: "Review" button for the desktop title bar, with an open-note badge.
import React, { useMemo } from "react";
import { MessageSquareText } from "lucide-react";
import { ToolcraftButton as Button } from "@openreel/ui";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { useReviewUIStore } from "./review-ui-store";

export const ReviewTitleButton: React.FC = () => {
  const review = useProjectStore((s) => s.project?.review);
  const open = useMemo(() => getReview({ review }).notes.filter((n) => n.status === "open").length, [review]);
  const { open: visible, toggle } = useReviewUIStore();
  return (
    <Button
      label={open ? `Review · ${open}` : "Review"}
      aria-label={`Review notes${open ? ` (${open} open)` : ""}`}
      variant={visible ? "primary" : "secondary"}
      size="sm"
      icon={<MessageSquareText size={15} aria-hidden />}
      onClick={toggle}
      className="mr-2"
      aria-pressed={visible}
    />
  );
};
