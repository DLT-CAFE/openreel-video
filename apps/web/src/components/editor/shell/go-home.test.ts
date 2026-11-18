import { describe, it, expect, vi, beforeEach } from "vitest";
import { useProjectStore } from "../../../stores/project-store";
import { goHome } from "./go-home";

describe("goHome", () => {
  beforeEach(() => {
    useProjectStore.setState({ hasOpenProject: true });
  });

  it("navigates to the welcome route in the browser", async () => {
    const navigate = vi.fn();
    await goHome({ platform: "web" }, navigate);
    expect(navigate).toHaveBeenCalledWith("welcome");
    expect(useProjectStore.getState().hasOpenProject).toBe(true);
  });

  it("saves, then closes the project on desktop", async () => {
    const forceSave = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ forceSave });
    const navigate = vi.fn();
    await goHome({ platform: "desktop" }, navigate);
    expect(forceSave).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(useProjectStore.getState().hasOpenProject).toBe(false);
  });

  it("keeps the project open on desktop if the save fails", async () => {
    useProjectStore.setState({ forceSave: vi.fn().mockRejectedValue(new Error("disk")) });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await goHome({ platform: "desktop" }, vi.fn());
    expect(useProjectStore.getState().hasOpenProject).toBe(true);
  });
});
