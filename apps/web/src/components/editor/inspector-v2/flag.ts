// DLT Cafe M4: Inspector V2 is on by default; the classic inspector stays
// reachable ("Classic inspector" in the V2 footer, "Try the new inspector"
// at the top of the classic one).
import { create } from "zustand";

const KEY = "dltcafe-inspector-v2";

function initial(): boolean {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
}

export const useInspectorV2Flag = create<{ enabled: boolean; setEnabled: (on: boolean) => void }>((set) => ({
  enabled: initial(),
  setEnabled: (enabled) => {
    try { localStorage.setItem(KEY, enabled ? "on" : "off"); } catch { /* storage unavailable */ }
    set({ enabled });
  },
}));
