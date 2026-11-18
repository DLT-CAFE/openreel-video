import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useEffect } from "react";
import { getReview } from "@openreel/review";
import { CollabDock, clampFloat } from "./CollabDock";
import { CollabLauncher } from "./CollabLauncher";
import { installCollabBridges, useCollabStore } from "./collab-store";
import { useReviewUIStore } from "../review/review-ui-store";
import { isAddNoteKey, isTypingTarget, useReviewShortcuts } from "../review/use-review-shortcuts";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { useUIStore } from "../../../stores/ui-store";

vi.mock("../chat/ChatPanel", () => ({ ChatPanel: () => <div data-testid="chat-panel">chat</div> }));

const key = (over: Partial<KeyboardEvent> = {}) =>
  ({ key: "n", code: "KeyN", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...over });

function Harness() {
  useReviewShortcuts();
  useEffect(() => installCollabBridges(), []);
  return (
    <div>
      <input aria-label="other field" />
      <CollabLauncher />
      <CollabDock />
    </div>
  );
}

beforeEach(() => {
  const { project } = useProjectStore.getState();
  useProjectStore.setState({ hasOpenProject: true, project: { ...project, review: undefined } });
  useTimelineStore.setState({ playheadPosition: 7.5 });
  useReviewUIStore.setState({ open: false, pendingT: null, composeToken: 0 });
  useCollabStore.setState({ open: false, tab: "chat", mode: "docked" });
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe("review shortcuts", () => {
  it("N only while the notes tab is showing, Shift+N anywhere, never with modifiers", () => {
    expect(isAddNoteKey(key(), false)).toBe(false);
    expect(isAddNoteKey(key(), true)).toBe(true);
    expect(isAddNoteKey(key({ shiftKey: true, key: "N" }), false)).toBe(true);
    expect(isAddNoteKey(key({ metaKey: true }), true)).toBe(false);
    expect(isAddNoteKey(key({ repeat: true }), true)).toBe(false);
  });

  it("treats fields and dialogs as typing targets", () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("span");
    dialog.appendChild(inner);
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});

describe("Collaborate panel", () => {
  it("opens from the floating launcher, docked by default, and closes", () => {
    render(<Harness />);
    expect(screen.queryByTestId("collab-dock")).toBeNull();
    fireEvent.click(screen.getByTestId("collab-launcher"));
    const dock = screen.getByTestId("collab-dock");
    expect(dock.getAttribute("data-mode")).toBe("docked");
    expect(screen.queryByTestId("collab-launcher")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(screen.queryByTestId("collab-dock")).toBeNull();
    expect(screen.getByTestId("collab-launcher")).toBeTruthy();
  });

  it("switches between AI chat and notes in one panel, and can float", async () => {
    useCollabStore.setState({ open: true });
    render(<Harness />);
    expect(await screen.findByTestId("chat-panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Notes/ }));
    expect(screen.getByLabelText("New review note")).toBeTruthy();
    expect(useReviewUIStore.getState().open).toBe(true); // plain N works on the notes tab
    fireEvent.click(screen.getByRole("button", { name: "Float panel" }));
    expect(screen.getByTestId("collab-dock").getAttribute("data-mode")).toBe("floating");
    fireEvent.click(screen.getByRole("button", { name: "Dock panel" }));
    expect(screen.getByTestId("collab-dock").getAttribute("data-mode")).toBe("docked");
  });

  it("Shift+N opens the notes tab with the time frozen; N in a field does nothing", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByLabelText("other field"), { key: "N", code: "KeyN", shiftKey: true });
    expect(screen.queryByTestId("collab-dock")).toBeNull();
    act(() => { fireEvent.keyDown(document.body, { key: "N", code: "KeyN", shiftKey: true }); });
    expect(useCollabStore.getState()).toMatchObject({ open: true, tab: "notes" });
    expect(useReviewUIStore.getState().pendingT).toBe(7.5);
    const composer = screen.getByLabelText("New review note");
    expect(document.activeElement).toBe(composer);
    act(() => { useTimelineStore.setState({ playheadPosition: 9 }); });
    fireEvent.change(composer, { target: { value: "Cut here" } });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    expect(getReview(useProjectStore.getState().project).notes[0]).toMatchObject({ t: 7.5, text: "Cut here" });
  });

  it("anything that opens the old AI chat panel opens the chat tab instead", () => {
    render(<Harness />);
    act(() => { useUIStore.getState().setPanelVisible("agentChat", true); });
    expect(useCollabStore.getState()).toMatchObject({ open: true, tab: "chat" });
    expect(useUIStore.getState().panels.agentChat.visible).toBe(false);
  });

  it("keeps a floating window on screen", () => {
    expect(clampFloat({ x: -1, y: 96, w: 380, h: 560 }, 1440, 900)).toEqual({ x: 1036, y: 96, w: 380, h: 560 });
    expect(clampFloat({ x: 5000, y: -50, w: 100, h: 5000 }, 1440, 900)).toEqual({ x: 1112, y: 8, w: 320, h: 884 });
  });
});

describe("Collab launcher indicators", () => {
  it("shows a notes count and a separate chat dot for thinking / unread replies", async () => {
    const { useChatStore } = await import("../../../stores/chat-store");
    useChatStore.setState({ status: "running", messages: [] });
    useCollabStore.setState({ chatSeen: 0 });
    const { addNote } = await import("@openreel/review");
    const review = addNote(getReview({}), { t: 1, text: "x" }).state;
    const { project } = useProjectStore.getState();
    useProjectStore.setState({ project: { ...project, review } });
    const view = render(<CollabLauncher />);
    const btn = view.getByTestId("collab-launcher");
    expect(btn.getAttribute("data-chat-state")).toBe("thinking");
    expect(view.getByTestId("collab-notes-badge").textContent).toBe("1");
    expect(btn.getAttribute("aria-label")).toMatch(/1 open note · AI is working/);
    act(() => { useChatStore.setState({ status: "idle", messages: [{ id: "a", role: "assistant", text: "Here's a plan", toolCalls: [] }] as never }); });
    expect(btn.getAttribute("data-chat-state")).toBe("unread");
    expect(view.getByTestId("collab-chat-dot")).toBeTruthy();
    fireEvent.click(btn); // opens on the chat tab
    expect(useCollabStore.getState()).toMatchObject({ open: true, tab: "chat" });
  });
});
