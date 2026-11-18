// DLT Cafe M4: Inspector V2 state shared by the frame, the tab slots and the
// (reused) InspectorSection / PropertySlider primitives.
import React, { createContext, useContext } from "react";
import type { InspectorTabId } from "../inspector/clip-tabs.config";
import { locateSection, type V2TopId } from "./tab-map";

export interface InspectorV2State {
  readonly top: V2TopId;
  readonly sub: string;
}

const V2Context = createContext<InspectorV2State | null>(null);
const SlotContext = createContext<InspectorTabId | null>(null);

export const InspectorV2Provider = V2Context.Provider;
export const InspectorV2SlotProvider = SlotContext.Provider;

/** Non-null only inside the V2 inspector. */
export function useInspectorV2(): InspectorV2State | null {
  return useContext(V2Context);
}

/** Should a section with this key show right now? (true outside V2) */
export function useSectionVisible(key: string | undefined): boolean {
  const v2 = useContext(V2Context);
  const slot = useContext(SlotContext);
  if (!v2 || !slot) return true;
  const at = locateSection(key, slot);
  return at.top === v2.top && at.sub === v2.sub;
}

export const V2TabSlot: React.FC<{ slot: InspectorTabId; children: React.ReactNode }> = ({ slot, children }) => {
  const v2 = useContext(V2Context);
  if (!v2) return <>{children}</>;
  const home = locateSection(undefined, slot);
  const looseHere = home.top === v2.top && home.sub === v2.sub;
  return (
    <SlotContext.Provider value={slot}>
      <div data-v2-slot={slot} data-v2-loose={looseHere ? "show" : "hide"} className="contents">
        {children}
      </div>
    </SlotContext.Provider>
  );
};
