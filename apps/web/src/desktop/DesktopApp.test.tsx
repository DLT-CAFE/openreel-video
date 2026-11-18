import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type React from "react";
import { Button } from "@astryxdesign/core/Button";

import { DesktopApp } from "./DesktopApp";
import { useProjectStore } from "../stores/project-store";
import type { ProjectState } from "../stores/project-store";
import { useUIStore } from "../stores/ui-store";
import { useSettingsStore } from "../stores/settings-store";

vi.mock("../stores/project-store", () => ({
  useProjectStore: vi.fn(),
}));

vi.mock("./editor/EditorBootstrapGate", () => ({
  EditorBootstrapGate: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// DLT Cafe: desktop renders the shared EditorInterface; the stub shows what the
// desktop chrome passes in (native export, settings, window controls).
vi.mock("../components/editor/EditorInterface", async () => {
  const { useEditorChrome } = await import("../components/editor/shell/editor-chrome");
  return {
    EditorInterface: () => {
      const chrome = useEditorChrome();
      return (
        <div data-testid="shared-editor" data-platform={chrome.platform} data-drag={String(chrome.dragRegion)}>
          {chrome.exportSlot}
          {chrome.trailingSlot}
        </div>
      );
    },
  };
});

vi.mock("./editor/DesktopExportButton", () => ({
  DesktopExportButton: () => <Button label="Video Export" />,
}));

vi.mock("../components/editor/settings/SettingsDialog", () => ({
  SettingsDialog: () => <div data-testid="desktop-settings-dialog" />,
}));

const mockedUseProjectStore = vi.mocked(useProjectStore);

function mockHasProject(value: boolean): void {
  mockedUseProjectStore.mockImplementation((selector) =>
    selector({ hasOpenProject: value } as unknown as ProjectState),
  );
}

beforeEach(() => {
  const panels = useUIStore.getState().panels;
  useUIStore.setState({
    desktopPage: "edit",
    panels: {
      ...panels,
      agentChat: { ...panels.agentChat, visible: false },
    },
  });
  useSettingsStore.setState({ settingsOpen: false, settingsTab: "general" });
  (window as unknown as { openreel: unknown }).openreel = {
    platform: "desktop",
    win: { minimize: () => {}, toggleMaximize: () => {}, close: () => {}, isMaximized: async () => false },
  };
});
afterEach(() => {
  delete (window as unknown as { openreel?: unknown }).openreel;
  vi.clearAllMocks();
});

describe("DesktopApp", () => {
  it("applies the desktop theme class to its root", () => {
    mockHasProject(false);
    const { container } = render(<DesktopApp />);
    expect(container.querySelector(".openreel-desktop")).not.toBeNull();
  });

  it("shows the start screen and hides the workspace when no project is open", () => {
    mockHasProject(false);
    const { getByText, queryByTestId } = render(<DesktopApp />);
    expect(getByText("New Project")).toBeTruthy();
    expect(queryByTestId("shared-editor")).toBeNull();
  });

  it("renders the shared editor layout in desktop chrome mode when a project is open", async () => {
    mockHasProject(true);
    const view = render(<DesktopApp />);
    const editor = await view.findByTestId("shared-editor");
    expect(editor.getAttribute("data-platform")).toBe("desktop");
    expect(editor.getAttribute("data-drag")).toBe("true");
    expect(view.getByRole("button", { name: "Video Export" })).toBeTruthy();
    expect(view.getByRole("button", { name: "Settings" })).toBeTruthy();
    // The separate desktop title bar is only used on the start screen.
    expect(view.queryByText("OpenReel")).toBeNull();
  });

  it("keeps settings reachable from the desktop title bar", () => {
    mockHasProject(false);
    const view = render(<DesktopApp />);

    fireEvent.click(view.getByRole("button", { name: "Settings" }));

    expect(useSettingsStore.getState().settingsOpen).toBe(true);
    expect(view.getByTestId("desktop-settings-dialog")).toBeTruthy();
  });
});
