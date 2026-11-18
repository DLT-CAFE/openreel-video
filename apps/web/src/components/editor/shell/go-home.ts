// DLT Cafe: "Back to home" for both shells. The browser app picks its screen
// from the URL hash, so navigating to #/welcome is enough. The desktop app picks
// its screen from hasOpenProject (start screen vs editor) and ignores the hash,
// so there we save the project first and then close it, which brings back the
// desktop start screen with the project in its recent list.
import { useProjectStore } from "../../../stores/project-store";
import type { EditorChrome } from "./editor-chrome";

export async function goHome(
  chrome: Pick<EditorChrome, "platform">,
  navigate: (route: "welcome") => void,
): Promise<void> {
  if (chrome.platform !== "desktop") {
    navigate("welcome");
    return;
  }
  const store = useProjectStore.getState();
  try {
    await store.forceSave();
  } catch (error) {
    // Keep the project open rather than risk losing changes.
    console.error("[goHome] save before closing failed:", error);
    return;
  }
  useProjectStore.setState({ hasOpenProject: false });
}
