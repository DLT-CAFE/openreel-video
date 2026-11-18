import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DockDropOverlay, DockGrip, applyDock, zoneAt, useDockDragStore } from "./dock-drag";
import { DEFAULT_LAYOUT, useEditorLayoutStore } from "./layout-store";
import { useCollabStore } from "../collab/collab-store";

beforeEach(() => {
  useEditorLayoutStore.setState({ ...DEFAULT_LAYOUT, saved: [], activeWorkspaceId: null });
  useCollabStore.setState({ open: false, tab: "chat", mode: "docked", side: "right" });
  useDockDragStore.setState({ dragging: null, zone: null });
});

describe("drag to dock", () => {
  it("maps pointer x to zones (float only for the AI & notes panel)", () => {
    expect(zoneAt(100, 1000, "media")).toBe("left");
    expect(zoneAt(900, 1000, "inspector")).toBe("right");
    expect(zoneAt(500, 1000, "media")).toBeNull();
    expect(zoneAt(500, 1000, "collab")).toBe("float");
  });

  it("applies docking for each panel", () => {
    applyDock("media", "right");
    expect(useEditorLayoutStore.getState().swapSides).toBe(true);
    applyDock("inspector", "right");
    expect(useEditorLayoutStore.getState().swapSides).toBe(false);
    applyDock("collab", "left");
    expect(useCollabStore.getState()).toMatchObject({ side: "left", mode: "docked", open: true });
    applyDock("collab", "float");
    expect(useCollabStore.getState().mode).toBe("floating");
  });

  it("dragging a grip shows the drop overlay and docks on release", () => {
    Object.defineProperty(window, "innerWidth", { value: 1200, configurable: true });
    render(<><DockGrip panel="inspector" /><DockDropOverlay /></>);
    fireEvent.pointerDown(screen.getByTestId("dock-grip-inspector"), { button: 0 });
    expect(screen.getByTestId("dock-overlay")).toBeTruthy();
    act(() => { window.dispatchEvent(new MouseEvent("pointermove", { clientX: 50 })); });
    expect(useDockDragStore.getState().zone).toBe("left");
    act(() => { window.dispatchEvent(new MouseEvent("pointerup", { clientX: 50 })); });
    expect(useEditorLayoutStore.getState().swapSides).toBe(true);
    expect(screen.queryByTestId("dock-overlay")).toBeNull();
  });
});
