// DLT Cafe: full-height, resizable dock for the Review panel on the right edge
// of the editor. It has its own column, so it stays visible next to the
// Inspector and the AI chat. On compact (phone/tablet) layouts it overlays.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ReviewPanel } from "./ReviewPanel";
import {
  REVIEW_DOCK_MAX_W,
  REVIEW_DOCK_MIN_W,
  loadDockWidth,
  saveDockWidth,
  useReviewUIStore,
} from "./review-ui-store";

export const ReviewDock: React.FC<{ compact?: boolean; variant?: "web" | "desktop" }> = ({ compact = false, variant = "web" }) => {
  const open = useReviewUIStore((s) => s.open);
  const setOpen = useReviewUIStore((s) => s.setOpen);
  const [width, setWidth] = useState(loadDockWidth);
  const dragging = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = dragging.current;
      if (!d) return;
      setWidth(Math.min(REVIEW_DOCK_MAX_W, Math.max(REVIEW_DOCK_MIN_W, d.startW + (d.startX - e.clientX))));
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => { saveDockWidth(w); return w; });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [width]);

  if (!open) return null;

  if (compact) {
    return (
      <aside
        aria-label="Review dock"
        data-testid="review-dock"
        className="absolute inset-y-0 right-0 z-40 w-[min(100%,380px)] border-l border-border bg-bg-1 shadow-2xl"
      >
        <ReviewPanel onClose={() => setOpen(false)} />
      </aside>
    );
  }

  return (
    <aside
      aria-label="Review dock"
      data-testid="review-dock"
      className={`relative flex h-full shrink-0 ${variant === "desktop" ? "bg-bg" : "py-2.5 pr-2.5"}`}
      style={{ width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize review dock"
        aria-valuenow={width}
        aria-valuemin={REVIEW_DOCK_MIN_W}
        aria-valuemax={REVIEW_DOCK_MAX_W}
        tabIndex={0}
        className="group/h grid w-2 shrink-0 cursor-col-resize place-items-center"
        onMouseDown={startDrag}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setWidth((w) => {
            const next = Math.min(REVIEW_DOCK_MAX_W, Math.max(REVIEW_DOCK_MIN_W, w + (e.key === "ArrowLeft" ? 20 : -20)));
            saveDockWidth(next);
            return next;
          });
        }}
      >
        <span className="h-10 w-1 rounded-full bg-transparent transition-colors group-hover/h:bg-accent/40" />
      </div>
      <div className={`min-w-0 flex-1 overflow-hidden bg-bg-1 ${variant === "desktop" ? "" : "rounded-xl border border-border shadow-sm"}`}>
        <ReviewPanel onClose={() => setOpen(false)} />
      </div>
    </aside>
  );
};
