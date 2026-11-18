import { describe, it, expect, beforeEach } from "vitest";
import { getReview, addNote, sendNotesToClaude, markClaudeSeen, approve } from "@openreel/review";
import { LiveEditorHost } from "../live-host";
import { useProjectStore } from "../../../stores/project-store";

describe("LiveEditorHost.waitForReviewEvent", () => {
  beforeEach(() => {
    const { project } = useProjectStore.getState();
    const seen = markClaudeSeen(addNote(getReview({}), { t: 1, text: "x" }).state);
    useProjectStore.setState({ hasOpenProject: true, project: { ...project, review: seen } });
  });

  it("resolves when the person presses Send", async () => {
    const host = new LiveEditorHost();
    const waiting = host.waitForReviewEvent(undefined, 5000);
    await new Promise((r) => setTimeout(r, 20));
    useProjectStore.getState().updateReview((r) => sendNotesToClaude(r));
    const event = await waiting;
    expect(event?.event).toBe("send");
  });

  it("resolves on Approve after the cursor and times out otherwise", async () => {
    const host = new LiveEditorHost();
    expect(await host.waitForReviewEvent(undefined, 30)).toBeNull();
    const waiting = host.waitForReviewEvent(new Date(0).toISOString(), 5000);
    useProjectStore.getState().updateReview((r) => approve(r));
    expect((await waiting)?.event).toBe("approve");
  });
});
