// DLT Cafe M6: drag-to-dock. Grab a panel's grip and drop it on the left or
// right side of the window (the AI & notes panel can also be dropped in the
// middle to float). Same result as the Workspace menu toggles, which stay as
// the keyboard-accessible way to do it.
import React, { useEffect } from "react";
import { create } from "zustand";
import { GripVertical } from "lucide-react";
import { useEditorLayoutStore } from "./layout-store";
import { useCollabStore } from "../collab/collab-store";

export type DockPanel = "media" | "inspector" | "collab";
export type DockZone = "left" | "right" | "float";

interface DockDragState {
  dragging: DockPanel | null;
  zone: DockZone | null;
  start: (panel: DockPanel) => void;
  setZone: (zone: DockZone | null) => void;
  end: () => void;
}

export const useDockDragStore = create<DockDragState>((set) => ({
  dragging: null,
  zone: null,
  start: (dragging) => set({ dragging, zone: null }),
  setZone: (zone) => set({ zone }),
  end: () => set({ dragging: null, zone: null }),
}));

export function zoneAt(x: number, width: number, panel: DockPanel): DockZone | null {
  if (x < width * 0.33) return "left";
  if (x > width * 0.67) return "right";
  return panel === "collab" ? "float" : null;
}

export function applyDock(panel: DockPanel, zone: DockZone): void {
  const layout = useEditorLayoutStore.getState();
  if (panel === "media") layout.setLayout({ swapSides: zone === "right", mediaCollapsed: false });
  else if (panel === "inspector") layout.setLayout({ swapSides: zone === "left" });
  else {
    const collab = useCollabStore.getState();
    if (zone === "float") collab.setMode("floating");
    else { collab.setSide(zone); collab.setMode("docked"); }
    collab.openPanel();
  }
}

const LABEL: Record<DockPanel, string> = { media: "media panel", inspector: "Inspector", collab: "AI & notes panel" };

export const DockGrip: React.FC<{ panel: DockPanel; className?: string }> = ({ panel, className }) => (
  <button
    type="button"
    aria-label={`Move ${LABEL[panel]} (drag to the left or right side)`}
    title={`Drag to dock the ${LABEL[panel]} left or right`}
    data-testid={`dock-grip-${panel}`}
    onPointerDown={(e) => {
      if (e.button > 0) return; // left button / touch / pen only
      e.preventDefault();
      e.stopPropagation();
      useDockDragStore.getState().start(panel);
    }}
    className={`grid h-7 w-6 shrink-0 cursor-grab place-items-center rounded-md text-fg-3 hover:bg-hover hover:text-fg active:cursor-grabbing ${className ?? ""}`}
  >
    <GripVertical size={14} aria-hidden />
  </button>
);

/** Full-window drop targets while a panel is being dragged. */
export const DockDropOverlay: React.FC = () => {
  const { dragging, zone, setZone, end } = useDockDragStore();

  useEffect(() => {
    if (!dragging) return;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    const onMove = (e: PointerEvent) => setZone(zoneAt(e.clientX, window.innerWidth, dragging));
    const onUp = (e: PointerEvent) => {
      const z = zoneAt(e.clientX, window.innerWidth, dragging);
      if (z) applyDock(dragging, z);
      end();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") end(); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [dragging, setZone, end]);

  if (!dragging) return null;
  const zoneCls = (z: DockZone) =>
    `flex items-center justify-center rounded-2xl border-2 border-dashed text-[13px] font-semibold transition-colors ${
      zone === z ? "border-accent bg-selected text-fg" : "border-border-strong bg-bg-1/90 text-fg-2"
    }`;
  return (
    <div data-testid="dock-overlay" className="pointer-events-none fixed inset-0 z-[60] grid grid-cols-[33%_34%_33%] gap-3 bg-black/40 p-4">
      <div className={zoneCls("left")}>Dock {LABEL[dragging]} on the left</div>
      {dragging === "collab" ? <div className={zoneCls("float")}>Float</div> : <div />}
      <div className={zoneCls("right")}>Dock {LABEL[dragging]} on the right</div>
    </div>
  );
};
