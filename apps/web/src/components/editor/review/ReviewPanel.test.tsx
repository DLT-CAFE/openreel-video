import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ReviewPanel } from "./ReviewPanel";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { getReview } from "@openreel/review";

describe("ReviewPanel", () => {
  beforeEach(() => {
    const { project } = useProjectStore.getState();
    useProjectStore.setState({ hasOpenProject: true, project: { ...project, review: undefined } });
    useTimelineStore.setState({ playheadPosition: 12.3 });
  });

  it("adds a note at the playhead, replies, marks done and sends to Claude", () => {
    render(<ReviewPanel />);
    expect(screen.getByTestId("review-status").textContent).toBe("Draft");
    fireEvent.change(screen.getByLabelText("New review note"), { target: { value: "Trim this pause" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    const note = getReview(useProjectStore.getState().project).notes[0];
    expect(note).toMatchObject({ t: 12.3, text: "Trim this pause", status: "open" });
    expect(screen.getByText("Trim this pause")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Send notes to Claude" }));
    expect(screen.getByTestId("review-status").textContent).toBe("Changes requested");
    expect(screen.getByTestId("review-footer-status").textContent).toMatch(/Waiting for Claude/);

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.change(screen.getByLabelText("Reply"), { target: { value: "also the next one" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Reply" }).at(-1)!);
    expect(getReview(useProjectStore.getState().project).notes[0].replies[0].text).toBe("also the next one");

    act(() => { fireEvent.click(screen.getByRole("button", { name: "Mark note done" })); });
    expect(getReview(useProjectStore.getState().project).notes[0].status).toBe("done");
    expect(screen.getByRole("tab", { name: /Done 1/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
    expect(screen.getByTestId("review-status").textContent).toBe("Approved");
  });
});
