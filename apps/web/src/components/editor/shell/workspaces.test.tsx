import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BUILTIN_WORKSPACES, DEFAULT_LAYOUT, currentLayout, sanitizeLayout, useEditorLayoutStore } from "./layout-store";
import { WorkspaceMenu, applyWorkspace } from "./WorkspaceMenu";
import { useCollabStore } from "../collab/collab-store";

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  useEditorLayoutStore.setState({ ...DEFAULT_LAYOUT, saved: [], activeWorkspaceId: null });
  useCollabStore.setState({ open: false, tab: "chat", mode: "docked", side: "right" });
});

describe("layout store", () => {
  it("sanitizes stored layouts", () => {
    expect(sanitizeLayout({ mediaWidth: 5000, inspectorWidth: 300, landscapeTimelineVh: "x", swapSides: true, junk: 1 })).toEqual({ inspectorWidth: 300, swapSides: true });
    expect(sanitizeLayout(null)).toEqual({});
  });

  it("saves, overwrites by name, persists and deletes workspaces", () => {
    const s = () => useEditorLayoutStore.getState();
    s().setLayout({ mediaCollapsed: true, landscapeTimelineVh: 50 });
    const ws = s().saveWorkspace("Color pass", currentLayout(), { open: true, mode: "floating", tab: "notes", side: "left" });
    expect(s().saved).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem("dltcafe-workspaces")!)[0]).toMatchObject({ name: "Color pass", layout: { mediaCollapsed: true, landscapeTimelineVh: 50 } });
    s().saveWorkspace("color pass", currentLayout(), { open: false, mode: "docked", tab: "chat", side: "right" });
    expect(s().saved).toHaveLength(1);
    s().deleteWorkspace(ws.id);
    expect(s().saved).toHaveLength(0);
  });

  it("applies a workspace to the layout and the AI & notes panel", () => {
    applyWorkspace(BUILTIN_WORKSPACES.find((w) => w.id === "review")!);
    expect(useEditorLayoutStore.getState()).toMatchObject({ mediaCollapsed: true, landscapeTimelineVh: 32, activeWorkspaceId: "review" });
    expect(useCollabStore.getState()).toMatchObject({ open: true, tab: "notes", mode: "docked", side: "right" });
    applyWorkspace(BUILTIN_WORKSPACES.find((w) => w.id === "edit")!);
    expect(useEditorLayoutStore.getState().mediaCollapsed).toBe(false);
    expect(useCollabStore.getState().open).toBe(false);
  });
});

describe("WorkspaceMenu", () => {
  it("switches presets, saves the current layout and swaps sides", () => {
    render(<WorkspaceMenu />);
    fireEvent.click(screen.getByRole("button", { name: /^Workspace/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Timeline focus" }));
    expect(useEditorLayoutStore.getState().landscapeTimelineVh).toBe(58);
    fireEvent.click(screen.getByRole("button", { name: /^Workspace/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Save current layout/ }));
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "My cut" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(useEditorLayoutStore.getState().saved.map((w) => w.name)).toEqual(["My cut"]);
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: /Inspector left/ }));
    expect(useEditorLayoutStore.getState().swapSides).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: /Dock AI & notes on the left/ }));
    expect(useCollabStore.getState().side).toBe("left");
  });
});
