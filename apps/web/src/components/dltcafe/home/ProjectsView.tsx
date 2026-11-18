// DLT Cafe: the home screen's project list: search, filter by format, sort, grid/list,
// multi-select, and per-project actions (open, rename, duplicate, archive, delete).
// Delete moves a project to "Recently deleted"; only from there can it be removed for good,
// after a confirmation.
import React, { useEffect, useMemo, useState } from "react";
import {
  Archive, ArchiveRestore, Check, Copy, Film, LayoutGrid, List, MoreHorizontal, Pencil, RotateCcw, Search, Sparkles, Trash2, X,
} from "lucide-react";
import { ToolcraftContextMenu, ToolcraftDropdownMenu, type ToolcraftMenuOption } from "@openreel/ui";
import {
  archiveProjects, deleteProjectsForever, duplicateLibraryProject, formatDuration, renameLibraryProject, restoreProjects,
  timeAgo, trashProjects, unarchiveProjects, type LibraryProject, type ProjectFormat,
} from "../../../services/dltcafe/project-library";
import { toast } from "../../../stores/notification-store";

export type ProjectsMode = "all" | "archived" | "trash";
type Sort = "modified" | "created" | "name" | "duration";
type View = "grid" | "list";

const PREFS = "dltcafe-home-prefs";
function loadPrefs(): { sort: Sort; view: View } {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS) ?? "{}") as { sort?: Sort; view?: View };
    return { sort: p.sort ?? "modified", view: p.view ?? "grid" };
  } catch {
    return { sort: "modified", view: "grid" };
  }
}

const FORMAT_LABEL: Record<ProjectFormat, string> = { vertical: "Vertical", horizontal: "Horizontal", square: "Square", other: "Other" };

export const ProjectsView: React.FC<{
  mode: ProjectsMode;
  projects: readonly LibraryProject[];
  reload: () => Promise<void>;
  onOpen: (p: LibraryProject) => void;
  /** Home overview: first N, no toolbar. */
  limit?: number;
  query?: string;
  openingId?: string | null;
}> = ({ mode, projects, reload, onOpen, limit, query: externalQuery, openingId }) => {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState<"" | ProjectFormat>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<LibraryProject | null>(null);
  const [confirm, setConfirm] = useState<{ ids: string[]; title: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS, JSON.stringify(prefs));
    } catch {
      /* per-session only */
    }
  }, [prefs]);
  useEffect(() => setSelected(new Set()), [mode]);

  const q = (externalQuery ?? query).trim().toLowerCase();
  const list = useMemo(() => {
    const inMode = projects.filter((p) => (mode === "trash" ? !!p.trashedAt : !p.trashedAt && (mode === "archived" ? !!p.archivedAt : !p.archivedAt)));
    const filtered = inMode.filter((p) => (!format || p.format === format) && (!q || p.name.toLowerCase().includes(q) || (p.styleId ?? "").includes(q)));
    const by: Record<Sort, (a: LibraryProject, b: LibraryProject) => number> = {
      modified: (a, b) => b.modifiedAt - a.modifiedAt,
      created: (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
      name: (a, b) => a.name.localeCompare(b.name),
      duration: (a, b) => b.durationSec - a.durationSec,
    };
    return filtered.sort(by[prefs.sort]);
  }, [projects, mode, format, q, prefs.sort]);
  const shown = limit ? list.slice(0, limit) : list;
  const sel = [...selected].filter((id) => list.some((p) => p.projectId === id));

  const act = async (fn: () => void | Promise<unknown>, done: string) => {
    try {
      await fn();
      setSelected(new Set());
      await reload();
      toast.success("Projects", done);
    } catch (error) {
      toast.error("Projects", error instanceof Error ? error.message : String(error));
    }
  };
  const plural = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

  const menuFor = (p: LibraryProject): ToolcraftMenuOption[] =>
    mode === "trash"
      ? [
          { label: "Restore", icon: <RotateCcw size={14} />, onClick: () => void act(() => restoreProjects([p.projectId]), `Restored "${p.name}"`) },
          { type: "divider" },
          { label: "Delete forever…", icon: <Trash2 size={14} />, className: "text-red-500", onClick: () => setConfirm({ ids: [p.projectId], title: `"${p.name}"` }) },
        ]
      : [
          { label: "Open", icon: <Film size={14} />, onClick: () => onOpen(p) },
          { label: "Rename…", icon: <Pencil size={14} />, onClick: () => setRenaming(p) },
          { label: "Duplicate", icon: <Copy size={14} />, onClick: () => void act(() => duplicateLibraryProject(p.projectId, `${p.name} copy`), `Duplicated "${p.name}"`) },
          p.archivedAt
            ? { label: "Unarchive", icon: <ArchiveRestore size={14} />, onClick: () => void act(() => unarchiveProjects([p.projectId]), `"${p.name}" is back in Projects`) }
            : { label: "Archive", icon: <Archive size={14} />, onClick: () => void act(() => archiveProjects([p.projectId]), `Archived "${p.name}"`) },
          { type: "divider" },
          { label: "Move to Recently deleted", icon: <Trash2 size={14} />, onClick: () => void act(() => trashProjects([p.projectId]), `"${p.name}" moved to Recently deleted`) },
        ];

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={`projects-${mode}`}>
      {!limit && (
        <div className="flex flex-wrap items-center gap-2">
          {externalQuery === undefined && (
            <label className="relative min-w-[180px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects"
                className="h-8 w-full rounded-md border border-border bg-bg-1 pl-8 pr-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none" />
            </label>
          )}
          <div role="radiogroup" aria-label="Format" className="flex rounded-md border border-border bg-bg-1 p-0.5">
            {(["", "vertical", "horizontal", "square"] as const).map((f) => (
              <button key={f || "all"} type="button" role="radio" aria-checked={format === f} onClick={() => setFormat(f)}
                className={`h-7 rounded px-2.5 text-[12px] ${format === f ? "bg-bg-3 font-medium text-fg" : "text-fg-2 hover:text-fg"}`}>
                {f ? FORMAT_LABEL[f] : "All"}
              </button>
            ))}
          </div>
          <select aria-label="Sort by" value={prefs.sort} onChange={(e) => setPrefs((p) => ({ ...p, sort: e.target.value as Sort }))}
            className="h-8 rounded-md border border-border bg-bg-1 px-2 text-[12px] text-fg">
            <option value="modified">Last edited</option>
            <option value="created">Date created</option>
            <option value="name">Name</option>
            <option value="duration">Length</option>
          </select>
          <div role="radiogroup" aria-label="View" className="flex rounded-md border border-border bg-bg-1 p-0.5">
            {(["grid", "list"] as const).map((v) => (
              <button key={v} type="button" role="radio" aria-checked={prefs.view === v} aria-label={v === "grid" ? "Grid view" : "List view"}
                onClick={() => setPrefs((p) => ({ ...p, view: v }))}
                className={`grid h-7 w-7 place-items-center rounded ${prefs.view === v ? "bg-bg-3 text-fg" : "text-fg-2 hover:text-fg"}`}>
                {v === "grid" ? <LayoutGrid size={14} aria-hidden /> : <List size={14} aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      )}

      {sel.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2" role="toolbar" aria-label="Selected projects">
          <span className="text-[12px] font-medium text-fg">{sel.length} selected</span>
          <span className="flex-1" />
          {mode === "trash" ? (
            <>
              <BulkBtn icon={<RotateCcw size={13} />} label="Restore" onClick={() => void act(() => restoreProjects(sel), `Restored ${plural(sel.length)}`)} />
              <BulkBtn icon={<Trash2 size={13} />} label="Delete forever…" danger onClick={() => setConfirm({ ids: sel, title: plural(sel.length) })} />
            </>
          ) : (
            <>
              {mode === "archived" ? (
                <BulkBtn icon={<ArchiveRestore size={13} />} label="Unarchive" onClick={() => void act(() => unarchiveProjects(sel), `Unarchived ${plural(sel.length)}`)} />
              ) : (
                <BulkBtn icon={<Archive size={13} />} label="Archive" onClick={() => void act(() => archiveProjects(sel), `Archived ${plural(sel.length)}`)} />
              )}
              <BulkBtn icon={<Trash2 size={13} />} label="Delete" onClick={() => void act(() => trashProjects(sel), `${plural(sel.length)} moved to Recently deleted`)} />
            </>
          )}
          <BulkBtn icon={<X size={13} />} label="Clear" onClick={() => setSelected(new Set())} />
        </div>
      )}

      {mode === "trash" && list.length > 0 && !sel.length && (
        <div className="flex items-center gap-2 text-[12px] text-fg-2">
          <span className="flex-1">Projects here aren't gone yet. Restore them, or delete them for good.</span>
          <BulkBtn icon={<Trash2 size={13} />} label="Empty Recently deleted…" danger onClick={() => setConfirm({ ids: list.map((p) => p.projectId), title: `all ${plural(list.length)} in Recently deleted` })} />
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-[13px] text-fg-muted">
          {mode === "trash" ? "Nothing in Recently deleted." : mode === "archived" ? "No archived projects." : q || format ? "No projects match." : "No projects yet. Start one above."}
        </div>
      ) : prefs.view === "grid" || limit ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {shown.map((p) => (
            <ToolcraftContextMenu key={p.projectId} items={menuFor(p)}>
              <div className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-bg-1 transition hover:border-accent/50 hover:shadow-md ${selected.has(p.projectId) ? "border-accent ring-1 ring-accent" : "border-border"}`}
                data-project-id={p.projectId}>
                <button type="button" onClick={() => (sel.length ? toggle(p.projectId) : mode !== "trash" && onOpen(p))} disabled={openingId === p.projectId}
                  aria-label={`Open ${p.name}`} className="relative aspect-video w-full overflow-hidden bg-bg-3 text-left">
                  <Thumb p={p} />
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/65 px-1.5 py-0.5 font-mono text-[10px] text-white">{formatDuration(p.durationSec)}</span>
                  {openingId === p.projectId && <span className="absolute inset-0 grid place-items-center bg-black/40 text-[12px] text-white">Opening…</span>}
                </button>
                <SelectBox checked={selected.has(p.projectId)} onChange={() => toggle(p.projectId)} name={p.name} visible={sel.length > 0} />
                <div className="flex items-start gap-1 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-fg" title={p.name}>{p.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-fg-muted">
                      {mode === "trash" && p.trashedAt ? `Deleted ${timeAgo(p.trashedAt)}` : timeAgo(p.modifiedAt)} · {FORMAT_LABEL[p.format]}
                      {p.width ? ` ${p.width}×${p.height}` : ""}
                    </p>
                  </div>
                  <ToolcraftDropdownMenu alignment="end" items={menuFor(p)} button={{ label: `Actions for ${p.name}`, isIconOnly: true, variant: "ghost", size: "sm", icon: <MoreHorizontal size={15} aria-hidden /> }} />
                </div>
              </div>
            </ToolcraftContextMenu>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-bg-1" role="table" aria-label="Projects">
          <div role="row" className="grid grid-cols-[28px_64px_minmax(0,1fr)_110px_90px_120px_40px] items-center gap-3 border-b border-border px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-fg-muted">
            <span />
            <span />
            <span>Name</span>
            <span>Format</span>
            <span>Length</span>
            <span>{mode === "trash" ? "Deleted" : "Edited"}</span>
            <span />
          </div>
          {shown.map((p) => (
            <ToolcraftContextMenu key={p.projectId} items={menuFor(p)}>
              <div role="row" data-project-id={p.projectId}
                className={`grid grid-cols-[28px_64px_minmax(0,1fr)_110px_90px_120px_40px] items-center gap-3 border-b border-border px-3 py-1.5 last:border-b-0 hover:bg-bg-2 ${selected.has(p.projectId) ? "bg-accent/5" : ""}`}>
                <input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.has(p.projectId)} onChange={() => toggle(p.projectId)} className="h-4 w-4 accent-emerald-600" />
                <span className="relative h-9 w-16 overflow-hidden rounded bg-bg-3"><Thumb p={p} small /></span>
                <button type="button" className="min-w-0 truncate text-left text-[13px] font-medium text-fg hover:underline" onClick={() => mode !== "trash" && onOpen(p)} aria-label={`Open ${p.name}`}>
                  {p.name}
                </button>
                <span className="text-[12px] text-fg-2">{FORMAT_LABEL[p.format]}</span>
                <span className="font-mono text-[12px] text-fg-2">{formatDuration(p.durationSec)}</span>
                <span className="text-[12px] text-fg-2">{timeAgo(mode === "trash" && p.trashedAt ? p.trashedAt : p.modifiedAt)}</span>
                <ToolcraftDropdownMenu alignment="end" items={menuFor(p)} button={{ label: `Actions for ${p.name}`, isIconOnly: true, variant: "ghost", size: "sm", icon: <MoreHorizontal size={15} aria-hidden /> }} />
              </div>
            </ToolcraftContextMenu>
          ))}
        </div>
      )}

      {renaming && (
        <SmallDialog title="Rename project" onClose={() => setRenaming(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
              const p = renaming;
              setRenaming(null);
              if (name && name !== p.name) void act(() => renameLibraryProject(p.projectId, name), `Renamed to "${name}"`);
            }}
          >
            <input name="name" defaultValue={renaming.name} autoFocus aria-label="Project name" onFocus={(e) => e.currentTarget.select()}
              className="h-9 w-full rounded-md border border-border bg-bg px-2 text-[13px] text-fg focus:border-accent focus:outline-none" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRenaming(null)} className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-bg-2">Cancel</button>
              <button type="submit" className="h-8 rounded-md bg-accent px-3 text-[12px] font-semibold text-white">Rename</button>
            </div>
          </form>
        </SmallDialog>
      )}
      {confirm && (
        <SmallDialog title="Delete forever?" onClose={() => setConfirm(null)}>
          <p className="text-[13px] text-fg-2">
            {confirm.title} will be removed from this {window.openreel?.platform === "desktop" ? "app" : "browser"} for good. This can't be undone.
            Your original media files aren't touched.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setConfirm(null)} className="h-8 rounded-md border border-border px-3 text-[12px] text-fg hover:bg-bg-2">Cancel</button>
            <button type="button" onClick={() => { const ids = confirm.ids; setConfirm(null); void act(() => deleteProjectsForever(ids), `Deleted ${plural(ids.length)} for good`); }}
              className="h-8 rounded-md bg-red-600 px-3 text-[12px] font-semibold text-white hover:bg-red-700">Delete forever</button>
          </div>
        </SmallDialog>
      )}
    </div>
  );
};

const Thumb: React.FC<{ p: LibraryProject; small?: boolean }> = ({ p, small }) =>
  p.thumbnail ? (
    <img src={p.thumbnail} alt="" className="absolute inset-0 h-full w-full object-contain" />
  ) : (
    <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-bg-2 to-bg-3">
      <span
        className="grid place-items-center rounded-[4px] border border-border bg-bg-1 text-fg-muted"
        style={{
          width: small ? 18 : p.format === "vertical" ? 34 : p.format === "square" ? 48 : 72,
          height: small ? 18 : p.format === "vertical" ? 60 : p.format === "square" ? 48 : 40,
        }}
      >
        {p.styleId ? <Sparkles size={small ? 10 : 14} aria-hidden /> : <Film size={small ? 10 : 14} aria-hidden />}
      </span>
    </span>
  );

const SelectBox: React.FC<{ checked: boolean; onChange: () => void; name: string; visible: boolean }> = ({ checked, onChange, name, visible }) => (
  <button type="button" role="checkbox" aria-checked={checked} aria-label={`Select ${name}`} onClick={onChange}
    className={`absolute left-2 top-2 grid h-5 w-5 place-items-center rounded border transition ${checked ? "border-accent bg-accent text-white" : "border-white/70 bg-black/40 text-transparent"} ${visible || checked ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"}`}>
    <Check size={12} aria-hidden />
  </button>
);

const BulkBtn: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button type="button" onClick={onClick}
    className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12px] ${danger ? "border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400" : "border-border text-fg hover:bg-bg-2"}`}>
    {icon}
    {label}
  </button>
);

export const SmallDialog: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-sm rounded-xl border border-border bg-bg p-5 text-fg shadow-2xl">
        <h2 className="mb-3 text-[15px] font-semibold">{title}</h2>
        {children}
      </section>
    </div>
  );
};
