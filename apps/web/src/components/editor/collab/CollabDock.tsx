// DLT Cafe M3: hosts the Collaborate panel docked (full-height right column)
// or floating (movable, resizable window). Overlay on compact layouts.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CollabPanel } from "./CollabPanel";
import { DEFAULT_FLOAT, useCollabStore, type FloatRect } from "./collab-store";
import { REVIEW_DOCK_MAX_W, REVIEW_DOCK_MIN_W, loadDockWidth, saveDockWidth } from "../review/review-ui-store";

const MIN_W = 320, MIN_H = 320;

export function clampFloat(r: FloatRect, vw: number, vh: number): FloatRect {
  const w = Math.min(Math.max(r.w, MIN_W), Math.max(MIN_W, vw - 16));
  const h = Math.min(Math.max(r.h, MIN_H), Math.max(MIN_H, vh - 16));
  const x = r.x < 0 ? vw - w - 24 : Math.min(Math.max(r.x, 8), Math.max(8, vw - w - 8));
  const y = Math.min(Math.max(r.y, 8), Math.max(8, vh - h - 8));
  return { x, y, w, h };
}

export const CollabDock: React.FC<{ compact?: boolean; variant?: "web" | "desktop" }> = ({ compact = false }) => {
  const { open, mode, float, setFloat, close } = useCollabStore();
  const [width, setWidth] = useState(loadDockWidth);
  const drag = useRef<{ kind: "dock" | "move" | "resize"; sx: number; sy: number; start: FloatRect; w: number } | null>(null);
  const [live, setLive] = useState<FloatRect | null>(null);

  const viewport = () => ({ vw: window.innerWidth, vh: window.innerHeight });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      const { vw, vh } = viewport();
      if (d.kind === "dock") setWidth(Math.min(REVIEW_DOCK_MAX_W, Math.max(REVIEW_DOCK_MIN_W, d.w - dx)));
      else if (d.kind === "move") setLive(clampFloat({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, vw, vh));
      else setLive(clampFloat({ ...d.start, w: d.start.w + dx, h: d.start.h + dy }, vw, vh));
    };
    const onUp = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      document.body.style.userSelect = "";
      if (d.kind === "dock") setWidth((w) => { saveDockWidth(w); return w; });
      else setLive((r) => { if (r) setFloat(r); return null; });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [setFloat]);

  const begin = useCallback((kind: "dock" | "move" | "resize", e: React.PointerEvent, start: FloatRect) => {
    if (e.button !== 0) return;
    e.preventDefault();
    document.body.style.userSelect = "none";
    drag.current = { kind, sx: e.clientX, sy: e.clientY, start, w: width };
  }, [width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && mode === "floating" && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mode, close]);

  if (!open) return null;

  if (compact) {
    return (
      <aside aria-label="Collaborate panel" data-testid="collab-dock" data-mode="overlay" className="absolute inset-y-0 right-0 z-40 w-[min(100%,400px)] border-l border-border shadow-2xl">
        <CollabPanel />
      </aside>
    );
  }

  if (mode === "floating") {
    const { vw, vh } = viewport();
    const rect = live ?? clampFloat(float ?? DEFAULT_FLOAT, vw, vh);
    return (
      <aside
        aria-label="Collaborate panel"
        data-testid="collab-dock"
        data-mode="floating"
        className="fixed z-50 overflow-hidden rounded-xl border border-border-strong bg-bg-1 shadow-2xl"
        style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      >
        <CollabPanel onHeaderPointerDown={(e) => begin("move", e, rect)} />
        <div
          role="separator"
          aria-label="Resize panel"
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          onPointerDown={(e) => begin("resize", e, rect)}
        />
      </aside>
    );
  }

  return (
    <aside aria-label="Collaborate panel" data-testid="collab-dock" data-mode="docked" className="relative flex h-full shrink-0 py-2.5 pr-2.5" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        aria-valuenow={width}
        aria-valuemin={REVIEW_DOCK_MIN_W}
        aria-valuemax={REVIEW_DOCK_MAX_W}
        tabIndex={0}
        className="group/h grid w-2 shrink-0 cursor-col-resize place-items-center"
        onPointerDown={(e) => begin("dock", e, DEFAULT_FLOAT)}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          setWidth((w) => { const n = Math.min(REVIEW_DOCK_MAX_W, Math.max(REVIEW_DOCK_MIN_W, w + (e.key === "ArrowLeft" ? 20 : -20))); saveDockWidth(n); return n; });
        }}
      >
        <span className="h-10 w-1 rounded-full bg-transparent transition-colors group-hover/h:bg-accent/40" />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-border shadow-sm">
        <CollabPanel />
      </div>
    </aside>
  );
};
