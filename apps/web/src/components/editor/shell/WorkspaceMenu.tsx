// DLT Cafe M6: workspaces. Built-in presets plus your own saved layouts
// (panel sizes, media drawer, sides, timeline height, AI & notes panel).
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, Check, LayoutDashboard, PanelLeft, PanelRight, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  BUILTIN_WORKSPACES,
  DEFAULT_LAYOUT,
  currentLayout,
  useEditorLayoutStore,
  type Workspace,
} from "./layout-store";
import { useCollabStore } from "../collab/collab-store";

export function applyWorkspace(ws: Workspace): void {
  useEditorLayoutStore.getState().applyWorkspaceLayout(ws);
  const c = ws.collab;
  if (!c) return;
  const collab = useCollabStore.getState();
  if (c.mode) collab.setMode(c.mode);
  if (c.side) collab.setSide(c.side);
  if (c.tab) collab.setTab(c.tab);
  if (c.open === true) collab.openPanel(c.tab);
  if (c.open === false) collab.close();
}

const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-fg hover:bg-hover focus-visible:bg-hover focus-visible:outline-none";

export const WorkspaceMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { saved, activeWorkspaceId, swapSides, deleteWorkspace, saveWorkspace, setLayout } = useEditorLayoutStore();
  const collabSide = useCollabStore((s) => s.side);
  const all = [...BUILTIN_WORKSPACES, ...saved];
  const active = all.find((w) => w.id === activeWorkspaceId);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setNaming(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); setNaming(false); } };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("keydown", onKey); };
  }, [open]);

  const choose = (ws: Workspace) => { applyWorkspace(ws); setOpen(false); };
  const doSave = () => {
    const c = useCollabStore.getState();
    saveWorkspace(name, currentLayout(), { open: c.open, mode: c.mode, tab: c.tab, side: c.side });
    setName("");
    setNaming(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace${active ? `: ${active.name}` : ""}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] font-medium text-fg-2 hover:bg-hover hover:text-fg"
      >
        <LayoutDashboard size={16} aria-hidden />
        <span className="hidden max-w-[120px] truncate lg:inline">{active?.name ?? "Workspace"}</span>
      </button>
      {open && (
        <div role="menu" aria-label="Workspaces" className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-border-strong bg-bg-1 p-1.5 shadow-2xl">
          <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-fg-muted">Workspaces</div>
          {all.map((ws) => (
            <div key={ws.id} className="group flex items-center">
              <button type="button" role="menuitemradio" aria-checked={ws.id === activeWorkspaceId} className={item} onClick={() => choose(ws)}>
                <span className="grid w-4 place-items-center">{ws.id === activeWorkspaceId && <Check size={14} aria-hidden className="text-accent" />}</span>
                <span className="flex-1 truncate">{ws.name}</span>
              </button>
              {!ws.builtin && (
                <button type="button" aria-label={`Delete workspace ${ws.name}`} onClick={() => deleteWorkspace(ws.id)} className="mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </div>
          ))}
          <div className="my-1 h-px bg-border" />
          {naming ? (
            <form className="flex items-center gap-1.5 px-1.5 py-1" onSubmit={(e) => { e.preventDefault(); doSave(); }}>
              <input
                autoFocus
                aria-label="Workspace name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this layout"
                className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-bg-2 px-2 text-[13px] text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button type="submit" className="h-8 rounded-md bg-accent px-3 text-[13px] font-semibold text-accent-fg">Save</button>
            </form>
          ) : (
            <button type="button" role="menuitem" className={item} onClick={() => setNaming(true)}>
              <Save size={14} aria-hidden /> Save current layout…
            </button>
          )}
          <button type="button" role="menuitemcheckbox" aria-checked={swapSides} className={item} onClick={() => setLayout({ swapSides: !swapSides })}>
            <ArrowLeftRight size={14} aria-hidden /> {swapSides ? "Media left, Inspector right" : "Inspector left, media right"}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => useCollabStore.getState().setSide(collabSide === "right" ? "left" : "right")}>
            {collabSide === "right" ? <PanelLeft size={14} aria-hidden /> : <PanelRight size={14} aria-hidden />}
            Dock AI &amp; notes on the {collabSide === "right" ? "left" : "right"}
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { applyWorkspace({ id: "edit", name: "Edit", layout: { ...DEFAULT_LAYOUT }, collab: { side: "right", mode: "docked" } }); setOpen(false); }}>
            <RotateCcw size={14} aria-hidden /> Reset layout
          </button>
        </div>
      )}
    </div>
  );
};
