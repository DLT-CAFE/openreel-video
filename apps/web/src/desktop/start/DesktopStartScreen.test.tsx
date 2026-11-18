// DLT Cafe: the desktop start screen is the shared HomeScreen.
import "../../test/install-local-storage-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useUIStore } from "../../stores/ui-store";
import { useProjectStore } from "../../stores/project-store";

const lib = vi.hoisted(() => ({ projects: [] as Array<Record<string, unknown>>, deleted: [] as string[] }));

vi.mock("../../services/dltcafe/project-library", async () => {
  const actual = await vi.importActual<typeof import("../../services/dltcafe/project-library")>("../../services/dltcafe/project-library");
  return {
    ...actual,
    loadLibrary: vi.fn(async () => {
      const f = actual.readFlags();
      return lib.projects
        .filter((p) => !lib.deleted.includes(p.projectId as string))
        .map((p) => ({
          ...p,
          ...(f.archived[p.projectId as string] ? { archivedAt: 1 } : {}),
          ...(f.trashed[p.projectId as string] ? { trashedAt: 1 } : {}),
        }));
    }),
    deleteProjectsForever: vi.fn(async (ids: string[]) => {
      lib.deleted.push(...ids);
    }),
  };
});
vi.mock("../../services/dltcafe/creator-styles", async () => {
  const actual = await vi.importActual<typeof import("../../services/dltcafe/creator-styles")>("../../services/dltcafe/creator-styles");
  actual.useCreatorStyles.setState({ load: async () => null, status: "unpaired", error: "no styles in tests" });
  return actual;
});

import { DesktopStartScreen } from "./DesktopStartScreen";

const nav = (name: RegExp) => within(screen.getByRole("navigation", { name: "Home sections" })).getByRole("button", { name });

const project = (id: string, name: string) => ({
  projectId: id, saveId: `${id}-slot-0`, name, modifiedAt: Date.now() - 60_000, width: 1080, height: 1920, fps: 30,
  format: "vertical", durationSec: 12, clipCount: 3, mediaCount: 2,
});

describe("DesktopStartScreen (shared home screen)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    lib.projects = [project("a", "Alpha reel"), project("b", "Beta reel")];
    lib.deleted = [];
    useUIStore.setState({ desktopPage: "home" as never });
  });
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("starts a horizontal project and goes to the editor", async () => {
    const create = vi.fn();
    useProjectStore.setState({ createNewProject: create as unknown as ReturnType<typeof useProjectStore.getState>["createNewProject"] });
    render(<DesktopStartScreen />);
    fireEvent.click(screen.getByRole("button", { name: "New Horizontal project" }));
    expect(create).toHaveBeenCalledWith("New Horizontal video", { width: 1920, height: 1080, frameRate: 30 });
    expect(useUIStore.getState().desktopPage).toBe("edit");
  });

  it("lists recent projects and archives, trashes, restores and deletes for good only after confirming", async () => {
    render(<DesktopStartScreen />);
    await screen.findByText("Alpha reel");
    fireEvent.click(nav(/^Projects/));
    const list = await screen.findByTestId("projects-all");

    // select Alpha, archive it
    fireEvent.click(within(list).getByRole("checkbox", { name: "Select Alpha reel" }));
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(within(screen.getByTestId("projects-all")).queryByText("Alpha reel")).toBeNull());
    fireEvent.click(nav(/^Archived/));
    expect(await within(await screen.findByTestId("projects-archived")).findByText("Alpha reel")).toBeTruthy();

    // back to projects: Beta to Recently deleted
    fireEvent.click(nav(/^Projects/));
    fireEvent.click(within(await screen.findByTestId("projects-all")).getByRole("checkbox", { name: "Select Beta reel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(nav(/^Recently deleted/));
    const trash = await screen.findByTestId("projects-trash");
    expect(await within(trash).findByText("Beta reel")).toBeTruthy();

    // delete forever asks first; cancel keeps it
    fireEvent.click(screen.getByRole("button", { name: "Empty Recently deleted…" }));
    expect(screen.getByRole("dialog", { name: "Delete forever?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(lib.deleted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Empty Recently deleted…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(lib.deleted).toEqual(["b"]));
  });
});
