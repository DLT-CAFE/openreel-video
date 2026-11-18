// DLT Cafe M4: Inspector V2 chrome around the existing inspector sections:
// top tabs, segmented sub-tabs, a keyframe strip for the clip transform, and a
// sticky footer (Reset · Apply to all · Save as preset). Sections are the
// existing components, filtered per sub-tab via the V2 context.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { InspectorTabId } from "../inspector/clip-tabs.config";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { InspectorTabBar, SubTabBar } from "./kit/TabBars";
import { KeyframeControls } from "./kit/KeyframeControls";
import { InspectorV2Provider } from "./context";
import { topTabsFor, type V2TopId } from "./tab-map";
import { applyToAll, resetTransform, savePreset, seek, toggleTransformKeyframe, transformKeyframeTimes } from "./actions";
import { useInspectorV2Flag } from "./flag";
import "./inspector-v2.css";

const remembered: { top?: V2TopId; subs: Record<string, string> } = { subs: {} };

export const InspectorV2Frame: React.FC<{
  clipId: string;
  oldTabIds: readonly InspectorTabId[];
  /** Shown above the sections on the first tab's first sub-tab (quick actions). */
  lead?: React.ReactNode;
  children: React.ReactNode;
}> = ({ clipId, oldTabIds, lead, children }) => {
  const tops = useMemo(() => topTabsFor(oldTabIds), [oldTabIds]);
  const [top, setTop] = useState<V2TopId>(() => (remembered.top && tops.some((t) => t.id === remembered.top) ? remembered.top : tops[0]?.id ?? "video"));
  const activeTop = tops.find((t) => t.id === top) ?? tops[0];
  const [sub, setSub] = useState<string>(() => remembered.subs[activeTop?.id ?? ""] ?? activeTop?.subs[0]?.id ?? "");
  const activeSub = activeTop?.subs.find((s) => s.id === sub) ? sub : activeTop?.subs[0]?.id ?? "";
  useEffect(() => { if (activeTop && top !== activeTop.id) setTop(activeTop.id); }, [activeTop, top]);

  const selectTop = (id: string) => {
    const t = tops.find((x) => x.id === id);
    if (!t) return;
    remembered.top = t.id;
    setTop(t.id);
    setSub(remembered.subs[t.id] ?? t.subs[0]?.id ?? "");
  };
  const selectSub = (id: string) => { remembered.subs[top] = id; setSub(id); };

  // Keyframes for the clip transform (Video › Basic).
  const clip = useProjectStore((s) => s.getClip(clipId));
  const playhead = useTimelineStore((s) => s.playheadPosition);
  const times = useMemo(() => transformKeyframeTimes(clip), [clip]);
  const hasHere = times.some((t) => Math.abs(t - playhead) < 0.01);
  const prev = [...times].reverse().find((t) => t < playhead - 0.01);
  const next = times.find((t) => t > playhead + 0.01);

  // Empty sub-tab detection (nothing for this clip type there).
  const bodyRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(false);
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const check = () => setEmpty(el.querySelector("[data-v2-section]") === null && !el.querySelector('[data-v2-loose="show"] > *'));
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [top, activeSub, clipId]);

  const [presetName, setPresetName] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const setV2 = useInspectorV2Flag((s) => s.setEnabled);

  if (!activeTop) return <>{children}</>;
  const isVideoBasic = activeTop.id === "video" && activeSub === "basic";
  const applyKind = activeTop.id === "video" ? "transform" : activeTop.id === "adjust" ? "effects" : null;

  return (
    <InspectorV2Provider value={{ top: activeTop.id, sub: activeSub }}>
      <div className="inspector-v2 flex h-full min-h-0 flex-col" data-testid="inspector-v2">
        <InspectorTabBar tabs={tops} active={activeTop.id} onSelect={selectTop} />
        <SubTabBar tabs={activeTop.subs} active={activeSub} onSelect={selectSub} label={`${activeTop.label} options`} />
        {isVideoBasic && (
          <div className="mx-3 mt-1 flex h-9 items-center gap-2 rounded-lg bg-bg-2 px-2.5">
            <span className="flex-1 text-[13px] text-fg-2">Transform keyframes</span>
            <KeyframeControls
              label="transform"
              hasKeyframeHere={hasHere}
              canPrev={prev !== undefined}
              canNext={next !== undefined}
              onToggle={() => toggleTransformKeyframe(clipId, playhead)}
              onPrev={() => prev !== undefined && seek(prev)}
              onNext={() => next !== undefined && seek(next)}
            />
          </div>
        )}
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2 custom-scrollbar">
          {children}
          {lead && activeTop.id === tops[0]?.id && activeSub === activeTop.subs[0]?.id && <div className="mt-2">{lead}</div>}
          {empty && <p className="py-8 text-center text-[13px] text-fg-3">Nothing to adjust here for this clip.</p>}
        </div>
        <footer className="relative flex shrink-0 items-center gap-1.5 border-t border-border bg-bg-1 px-3 py-2">
          {presetName !== null ? (
            <form className="flex flex-1 items-center gap-2" onSubmit={(e) => { e.preventDefault(); void savePreset(clipId, presetName).then(() => setPresetName(null)); }}>
              <input autoFocus aria-label="Preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setPresetName(null); }} placeholder="Preset name" className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-bg-2 px-2 text-[13px] text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent" />
              <button type="submit" className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg">Save</button>
            </form>
          ) : (
            <>
              <button type="button" disabled={activeTop.id !== "video"} title={activeTop.id === "video" ? "Reset the clip transform" : "Use the section's own reset here"} onClick={() => void resetTransform(clipId)} className="h-8 shrink-0 whitespace-nowrap rounded-md border border-border-strong px-2.5 text-[12px] font-medium text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-40">Reset</button>
              <button type="button" disabled={!applyKind} title={applyKind ? `Copy this clip's ${applyKind} to the other selected clips (or the whole track)` : "Not available on this tab"} onClick={() => applyKind && void applyToAll(clipId, applyKind)} className="h-8 min-w-0 flex-1 truncate whitespace-nowrap rounded-md border border-border-strong px-2 text-[12px] font-medium text-fg-2 hover:bg-hover hover:text-fg disabled:opacity-40">Apply to all</button>
              <button type="button" onClick={() => setPresetName("")} className="h-8 shrink-0 whitespace-nowrap rounded-md bg-accent px-2.5 text-[12px] font-semibold text-accent-fg hover:bg-accent/90">Save as preset</button>
              <button type="button" aria-label="More inspector options" aria-expanded={menu} onClick={() => setMenu((v) => !v)} className="grid h-8 w-8 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg"><MoreHorizontal size={16} aria-hidden /></button>
              {menu && (
                <div role="menu" className="absolute bottom-12 right-3 z-20 w-56 rounded-lg border border-border-strong bg-bg-1 p-1 shadow-xl">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setV2(false); }} className="w-full rounded-md px-2.5 py-2 text-left text-[13px] text-fg hover:bg-hover">Use classic inspector</button>
                </div>
              )}
            </>
          )}
        </footer>
      </div>
    </InspectorV2Provider>
  );
};
