// DLT Cafe: "Back to home" for both shells. The browser app picks its screen
// from the URL hash, so navigating to #/welcome is enough. The desktop app picks
// its screen from hasOpenProject (start screen vs editor) and ignores the hash,
// so there we save the project first and then close it, which brings back the
// desktop start screen with the project in its recent list.
import { useProjectStore } from "../../../stores/project-store";
import type { EditorChrome } from "./editor-chrome";
import { captureProjectThumbnail } from "../../../services/dltcafe/project-library";

export async function goHome(
  chrome: Pick<EditorChrome, "platform">,
  navigate: (route: "welcome") => void,
): Promise<void> {
  const open = useProjectStore.getState();
  if (open.hasOpenProject) captureProjectThumbnail(open.project.id); // picture for the home screen's card
  if (chrome.platform !== "desktop") {
    navigate("welcome");
    return;
  }
  try {
    await open.forceSave();
  } catch (error) {
    // Keep the project open rather than risk losing changes.
    console.error("[goHome] save before closing failed:", error);
    return;
  }
  useProjectStore.setState({ hasOpenProject: false });
}
