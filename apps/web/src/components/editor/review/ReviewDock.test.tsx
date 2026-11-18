import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { getReview } from "@openreel/review";
import { ReviewDock } from "./ReviewDock";
import { useReviewUIStore } from "./review-ui-store";
import { isAddNoteKey, isTypingTarget, useReviewShortcuts } from "./use-review-shortcuts";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";

const key = (over: Partial<KeyboardEvent> = {}) =>
  ({ key: "n", code: "KeyN", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, ...over });

function Harness() {
  useReviewShortcuts();
  return (
    <div>
      <input aria-label="other field" />
      <ReviewDock />
    </div>
  );
}

describe("review shortcuts", () => {
  it("N only while the dock is open, Shift+N anywhere, never with modifiers", () => {
    expect(isAddNoteKey(key(), false)).toBe(false);
    expect(isAddNoteKey(key(), true)).toBe(true);
    expect(isAddNoteKey(key({ shiftKey: true, key: "N" }), false)).toBe(true);
    expect(isAddNoteKey(key({ metaKey: true }), true)).toBe(false);
    expect(isAddNoteKey(key({ repeat: true }), true)).toBe(false);
    expect(isAddNoteKey(key({ key: "m", code: "KeyM" }), true)).toBe(false);
  });

  it("treats fields and dialogs as typing targets", () => {
    const input = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const inner = document.createElement("span");
    dialog.appendChild(inner);
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(inner)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
  });
});

describe("ReviewDock", () => {
  beforeEach(() => {
    const { project } = useProjectStore.getState();
    useProjectStore.setState({ hasOpenProject: true, project: { ...project, review: undefined } });
    useTimelineStore.setState({ playheadPosition: 7.5 });
    useReviewUIStore.setState({ open: false, pendingT: null, composeToken: 0 });
  });

  it("Shift+N opens the dock with the time frozen; N in a text field does nothing", () => {
    render(<Harness />);
    expect(screen.queryByTestId("review-dock")).toBeNull();

    fireEvent.keyDown(screen.getByLabelText("other field"), { key: "N", code: "KeyN", shiftKey: true });
    expect(screen.queryByTestId("review-dock")).toBeNull();

    act(() => { fireEvent.keyDown(document.body, { key: "N", code: "KeyN", shiftKey: true }); });
    expect(screen.getByTestId("review-dock")).toBeTruthy();
    expect(useReviewUIStore.getState().pendingT).toBe(7.5);
    const composer = screen.getByLabelText("New review note");
    expect(document.activeElement).toBe(composer);

    // The playhead moves on, but the note keeps the frozen time.
    act(() => { useTimelineStore.setState({ playheadPosition: 9 }); });
    fireEvent.change(composer, { target: { value: "Cut here" } });
    fireEvent.keyDown(composer, { key: "Enter", metaKey: true });
    expect(getReview(useProjectStore.getState().project).notes[0]).toMatchObject({ t: 7.5, text: "Cut here" });
    expect(useReviewUIStore.getState().pendingT).toBeNull();
  });

  it("plain N adds a note while the dock is open and is ignored in fields", () => {
    useReviewUIStore.setState({ open: true });
    render(<Harness />);
    act(() => { fireEvent.keyDown(document.body, { key: "n", code: "KeyN" }); });
    expect(useReviewUIStore.getState().composeToken).toBe(1);
    fireEvent.keyDown(screen.getByLabelText("New review note"), { key: "n", code: "KeyN" });
    expect(useReviewUIStore.getState().composeToken).toBe(1);
  });

  it("closes from the panel's close button", () => {
    useReviewUIStore.setState({ open: true });
    render(<ReviewDock />);
    fireEvent.click(screen.getByRole("button", { name: "Close review panel" }));
    expect(screen.queryByTestId("review-dock")).toBeNull();
  });
});
