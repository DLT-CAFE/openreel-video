// DLT Cafe: one home screen for the browser and the desktop app (same look as the
// editor, light and dark): start something new, recent projects, creator styles,
// and the full project library (archive, recently deleted).
import React, { useCallback, useEffect, useState } from "react";
import {
  Archive, ArrowRight, Clock, FolderKanban, House, LayoutTemplate, Monitor, Moon, Palette, Plus, Search, Settings, Smartphone, Square, Sun, SunMoon, Trash2,
} from "lucide-react";
import { OpenReelMark } from "../../../desktop/brand/OpenReelMark";
import { useProjectStore } from "../../../stores/project-store";
import { useThemeStore } from "../../../stores/theme-store";
import { useSettingsStore } from "../../../stores/settings-store";
import { loadLibrary, type LibraryProject } from "../../../services/dltcafe/project-library";
import { useCreatorStyles } from "../../../services/dltcafe/creator-styles";
import { ProjectsView, type ProjectsMode } from "./ProjectsView";
import { StyleGallery } from "../styles/StyleGallery";
import { toast } from "../../../stores/notification-store";
import { DRAG_STYLE, NO_DRAG_STYLE, type EditorChrome } from "../../editor/shell/editor-chrome";

export type HomeSection = "home" | "projects" | "styles" | "templates" | "archived" | "trash";

const FORMATS = [
  { id: "vertical", label: "Vertical", hint: "Reels, TikTok, Shorts", width: 1080, height: 1920, icon: Smartphone },
  { id: "horizontal", label: "Horizontal", hint: "YouTube, web", width: 1920, height: 1080, icon: Monitor },
  { id: "square", label: "Square", hint: "Feed posts", width: 1080, height: 1080, icon: Square },
] as const;

export const HomeScreen: React.FC<{
  platform: "web" | "desktop";
  /** After a project was opened or created (web: go to the editor; desktop: the editor shows by itself). */
  onEnterEditor: () => void;
  /** Browser only: the built-in project templates gallery. */
  templates?: React.ReactNode;
  /** Settings button (the desktop title bar has its own). */
  showSettings?: boolean;
  initialSection?: HomeSection;
  /** Desktop: the header is the window's title bar (drag region, traffic-light inset, settings + window controls). */
  chrome?: EditorChrome;
}> = ({ platform, onEnterEditor, templates, showSettings = platform === "web", initialSection = "home", chrome }) => {
  const [section, setSection] = useState<HomeSection>(initialSection);
  const [projects, setProjects] = useState<LibraryProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const styleCount = useCreatorStyles((s) => s.index?.styles.length ?? 0);
  const { mode, toggleTheme } = useThemeStore();

  const reload = useCallback(async () => {
    try {
      setProjects(await loadLibrary());
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    void useCreatorStyles.getState().load();
  }, [reload]);

  const open = useCallback(
    async (p: LibraryProject) => {
      setOpeningId(p.projectId);
      try {
        const store = useProjectStore.getState();
        const ok = store.hasOpenProject && store.project.id === p.projectId ? true : await store.recoverFromAutoSave(p.saveId);
        if (ok) onEnterEditor();
        else toast.error("Couldn't open", `"${p.name}" couldn't be read.`);
      } finally {
        setOpeningId(null);
      }
    },
    [onEnterEditor],
  );

  const create = useCallback(
    (f: (typeof FORMATS)[number]) => {
      useProjectStore.getState().createNewProject(`New ${f.label} video`, { width: f.width, height: f.height, frameRate: 30 });
      onEnterEditor();
    },
    [onEnterEditor],
  );

  const active = projects.filter((p) => !p.trashedAt && !p.archivedAt);
  const counts = { projects: active.length, archived: projects.filter((p) => p.archivedAt && !p.trashedAt).length, trash: projects.filter((p) => p.trashedAt).length };
  const nav: Array<{ id: HomeSection; label: string; icon: React.ElementType; count?: number }> = [
    { id: "home", label: "Home", icon: House },
    { id: "projects", label: "Projects", icon: FolderKanban, count: counts.projects },
    { id: "styles", label: "Creator styles", icon: Palette, count: styleCount || undefined },
    ...(templates ? [{ id: "templates" as const, label: "Templates", icon: LayoutTemplate }] : []),
    { id: "archived", label: "Archived", icon: Archive, count: counts.archived || undefined },
    { id: "trash", label: "Recently deleted", icon: Trash2, count: counts.trash || undefined },
  ];
  const ThemeIcon = mode === "light" ? Sun : mode === "dark" ? Moon : SunMoon;
  const searching = search.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-bg text-fg" data-testid="home-screen">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-1 px-4"
        style={{ ...(chrome?.dragRegion ? DRAG_STYLE : {}), ...(chrome?.leadingInset ? { paddingLeft: chrome.leadingInset } : {}) }}>
        <OpenReelMark size={22} className="text-accent" />
        <span className="text-[14px] font-semibold tracking-tight">OpenReel</span>
        <label className="relative mx-auto w-full max-w-md" style={chrome?.dragRegion ? NO_DRAG_STYLE : undefined}>
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects and styles" aria-label="Search projects and styles"
            className="h-8 w-full rounded-md border border-border bg-bg pl-8 pr-2 text-[13px] placeholder:text-fg-muted focus:border-accent focus:outline-none" />
        </label>
        <button type="button" style={chrome?.dragRegion ? NO_DRAG_STYLE : undefined} onClick={toggleTheme} aria-label={`Theme: ${mode}`} title="Switch theme" className="grid h-8 w-8 place-items-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg">
          <ThemeIcon size={16} aria-hidden />
        </button>
        {showSettings && (
          <button type="button" onClick={() => useSettingsStore.getState().openSettings()} aria-label="Settings" className="grid h-8 w-8 place-items-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg">
            <Settings size={16} aria-hidden />
          </button>
        )}
        {chrome?.trailingSlot && <div className="flex items-center" style={NO_DRAG_STYLE}>{chrome.trailingSlot}</div>}
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label="Home sections" className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-border bg-bg-1 p-2 md:flex">
          {nav.map(({ id, label, icon: Icon, count }) => (
            <button key={id} type="button" aria-current={section === id && !searching ? "page" : undefined} onClick={() => { setSection(id); setSearch(""); }}
              className={`flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] ${section === id && !searching ? "bg-bg-3 font-medium text-fg" : "text-fg-2 hover:bg-bg-2 hover:text-fg"}`}>
              <Icon size={16} aria-hidden />
              <span className="flex-1 text-left">{label}</span>
              {count !== undefined && <span className="text-[11px] text-fg-muted">{count}</span>}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* narrow screens: sections as tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
            {nav.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => { setSection(id); setSearch(""); }}
                className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] ${section === id ? "bg-bg-3 font-medium text-fg" : "text-fg-2"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-6">
            {searching ? (
              <>
                <Section title="Projects">
                  <ProjectsView mode="all" projects={projects} reload={reload} onOpen={open} query={search} openingId={openingId} />
                </Section>
                <Section title="Creator styles">
                  <StyleGallery initialQuery={search} hideToolbar compact onJobStarted={onEnterEditor} />
                </Section>
              </>
            ) : section === "home" ? (
              <>
                <Section title="Start something new">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {FORMATS.map((f) => (
                      <button key={f.id} type="button" onClick={() => create(f)} aria-label={`New ${f.label} project`}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-bg-1 p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                          <f.icon size={20} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] font-semibold">{f.label}</span>
                          <span className="block text-[12px] text-fg-2">{f.hint}</span>
                          <span className="block font-mono text-[11px] text-fg-muted">{f.width} × {f.height}</span>
                        </span>
                        <Plus size={16} className="text-fg-muted group-hover:text-accent" aria-hidden />
                      </button>
                    ))}
                    <button type="button" onClick={() => setSection("styles")} aria-label="Start from a creator style"
                      className="group flex items-center gap-3 rounded-xl border border-accent/40 bg-gradient-to-br from-accent/10 to-transparent p-4 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-accent text-white">
                        <Palette size={20} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold">From a creator style</span>
                        <span className="block text-[12px] text-fg-2">Claude edits your footage in a style</span>
                      </span>
                      <ArrowRight size={16} className="text-accent" aria-hidden />
                    </button>
                  </div>
                </Section>
                <Section title="Recent projects" action={counts.projects > 8 ? { label: "All projects", onClick: () => setSection("projects") } : undefined} icon={Clock}>
                  {loading ? <p className="text-[12px] text-fg-muted">Loading projects…</p> : <ProjectsView mode="all" projects={projects} reload={reload} onOpen={open} limit={8} openingId={openingId} />}
                </Section>
                <Section title="Creator styles" action={{ label: "Browse all styles", onClick: () => setSection("styles") }} icon={Palette}>
                  <StyleGallery limit={6} compact hideToolbar columns="grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" onJobStarted={onEnterEditor} />
                </Section>
              </>
            ) : section === "styles" ? (
              <Section title="Creator styles" subtitle="Pick a style, add your footage, and Claude makes the edit. It opens here for review.">
                <StyleGallery onJobStarted={onEnterEditor} />
              </Section>
            ) : section === "templates" && templates ? (
              <Section title="Templates">{templates}</Section>
            ) : (
              <Section
                title={section === "projects" ? "Projects" : section === "archived" ? "Archived" : "Recently deleted"}
                subtitle={section === "archived" ? "Out of the way, not gone. Unarchive to bring them back." : section === "trash" ? undefined : `Saved in this ${platform === "desktop" ? "app" : "browser"}.`}
              >
                <ProjectsView mode={section === "projects" ? "all" : (section as ProjectsMode)} projects={projects} reload={reload} onOpen={open} openingId={openingId} />
              </Section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; action?: { label: string; onClick: () => void }; icon?: React.ElementType }> = ({ title, subtitle, children, action, icon: Icon }) => (
  <section className="flex min-w-0 flex-col gap-3">
    <div className="flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-[16px] font-semibold tracking-tight">
          {Icon && <Icon size={16} className="text-fg-muted" aria-hidden />}
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-fg-2">{subtitle}</p>}
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline">
          {action.label} <ArrowRight size={13} aria-hidden />
        </button>
      )}
    </div>
    {children}
  </section>
);
