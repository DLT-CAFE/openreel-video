// DLT Cafe: the desktop start screen is the shared HomeScreen (same as the browser):
// new project, recent projects, creator styles and the project library.
// The upstream start screen is in git history before this change.
import type { JSX } from "react";
import { useCallback } from "react";
import { HomeScreen } from "../../components/dltcafe/home/HomeScreen";
import { useUIStore } from "../../stores/ui-store";
import type { EditorChrome } from "../../components/editor/shell/editor-chrome";

export function DesktopStartScreen({ chrome }: { chrome?: EditorChrome } = {}): JSX.Element {
  const setDesktopPage = useUIStore((state) => state.setDesktopPage);
  // Opening or creating a project sets hasOpenProject, and DesktopApp swaps in the editor.
  const toEditor = useCallback(() => setDesktopPage("edit"), [setDesktopPage]);
  return <HomeScreen platform="desktop" onEnterEditor={toEditor} chrome={chrome} />;
}
