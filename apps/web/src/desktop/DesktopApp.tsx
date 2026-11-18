import type { JSX } from "react";
import { lazy, Suspense, useEffect } from "react";
import { WindowControls } from "./shell/WindowControls";
import { EditorChromeProvider, type EditorChrome } from "../components/editor/shell/editor-chrome"; // DLT Cafe
import { DesktopStartScreen } from "./start/DesktopStartScreen";
import { DesktopExportButton } from "./editor/DesktopExportButton";
import { ToastContainer } from "../components/Toast"; // DLT Cafe
import { EditorBootstrapGate } from "./editor/EditorBootstrapGate";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useProjectStore } from "../stores/project-store";
import { autoSaveManager } from "../services/auto-save";
import { UpdateBanner } from "./UpdateBanner";
import { installRendererCrashHandlers, reportRendererCrash } from "./crash-reporting";
import { installMcpListener } from "../services/agent/mcp-listener";
import { getLiveEditorHost } from "../services/agent/host-singleton";
import { createExportJobRunner } from "../services/agent/export-job-runner";
import { useSettingsStore } from "../stores/settings-store";
import { SettingsDialog } from "../components/editor/settings/SettingsDialog";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { Settings } from "@/icons/lucide-compat";
// DLT Cafe: desktop now uses the shared theme tokens (index.css, dark by
// default via theme-store) instead of forcing the Resolve palette in
// ./theme/desktop-theme.css, which stays available as a future palette option.

// DLT Cafe: desktop uses the same editor layout as the browser app.
const EditorInterface = lazy(() =>
  import("../components/editor/EditorInterface").then((m) => ({ default: m.EditorInterface })),
);

function detectPlatform(): string {
  if (typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)) return "darwin";
  if (typeof navigator !== "undefined" && /Win/i.test(navigator.platform)) return "win32";
  return "linux";
}

export function DesktopApp(): JSX.Element {
  const platform = detectPlatform();
  const hasProject = useProjectStore((state) => state.hasOpenProject);

  // Drive native-menu actions into the app: undo/redo hit the project store
  // directly; new/open/export are broadcast as events for the relevant UI to
  // pick up (e.g. the export button opens its dialog on "export").
  useEffect(() => {
    const bridge = window.openreel;
    if (!bridge?.onMenuAction) return;
    return bridge.onMenuAction((id) => {
      switch (id) {
        case "undo":
          void useProjectStore.getState().undo();
          break;
        case "redo":
          void useProjectStore.getState().redo();
          break;
        case "newProject":
        case "open":
        case "export":
          window.dispatchEvent(new CustomEvent(`openreel:menu:${id}`));
          break;
        case "settings":
          useSettingsStore.getState().openSettings();
          break;
      }
    });
  }, []);

  // Forward uncaught renderer errors + unhandled rejections to the native crash
  // collector so editor-side faults are captured alongside main-process crashes.
  useEffect(() => installRendererCrashHandlers(), []);

  // Serve main-process MCP tool calls against the live editor so external MCP
  // clients drive the open project through the same tool layer as the chat panel.
  // Also back the export_* job tools with a runner that renders via the export
  // engine and uploads the artifact to R2, returning a presigned download URL.
  useEffect(() => {
    getLiveEditorHost().setJobRunner(createExportJobRunner());
    return installMcpListener();
  }, []);

  // Answer the native unsaved-changes guard on window close / quit: report
  // dirty state and flush pending changes on request.
  useEffect(() => {
    const lifecycle = window.openreel?.lifecycle;
    if (!lifecycle) return;
    const offQuery = lifecycle.onQueryUnsaved(() =>
      autoSaveManager.hasUnsavedChanges(useProjectStore.getState().getFullProject()),
    );
    const offFlush = lifecycle.onFlush(() =>
      useProjectStore.getState().forceSave(),
    );
    return () => {
      offQuery();
      offFlush();
    };
  }, []);

  const chrome: EditorChrome = {
    platform: "desktop",
    dragRegion: true,
    leadingInset: platform === "darwin" ? 84 : 12,
    exportSlot: <DesktopExportButton />,
    trailingSlot: (
      <>
        <IconButton
          label="Settings"
          variant="ghost"
          size="sm"
          icon={<Settings size={16} aria-hidden />}
          onClick={() => useSettingsStore.getState().openSettings()}
          className="ml-2"
        />
        <WindowControls platform={platform} />
      </>
    ),
  };

  return (
    <div className="openreel-desktop isolate flex h-screen w-screen flex-col overflow-hidden bg-bg text-fg">
      {/* DLT Cafe: the home screen draws its own title bar (drag region, settings, window controls) */}
      <div className="min-h-0 flex-1">
        <ErrorBoundary
          onError={(error, info) =>
            reportRendererCrash({
              type: "react-error",
              message: error.message,
              stack: error.stack,
              context: { componentStack: info.componentStack },
            })
          }
        >
          {hasProject ? (
            <EditorBootstrapGate>
              <EditorChromeProvider value={chrome}>
                <Suspense fallback={<div className="grid h-full place-items-center text-sm text-fg-muted">Loading…</div>}>
                  <EditorInterface />
                </Suspense>
              </EditorChromeProvider>
            </EditorBootstrapGate>
          ) : (
            <DesktopStartScreen chrome={chrome} />
          )}
        </ErrorBoundary>
      </div>
      <UpdateBanner />
      {!hasProject ? <SettingsDialog /> : null}{/* the editor's top bar mounts its own */}
      <ToastContainer />{/* DLT Cafe: desktop shell had no toast host, so notifications were invisible */}
    </div>
  );
}
