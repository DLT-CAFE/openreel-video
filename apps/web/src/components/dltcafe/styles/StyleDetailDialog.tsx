// DLT Cafe: one creator style up close (loop, live HTML sample, what it lends) and "Use this style".
import React, { useEffect, useRef, useState } from "react";
import { Film, FolderOpen, Loader2, Play, Sparkles, X } from "lucide-react";
import { KIND_LABEL, canvasForKind, styleLiveUrl, styleMediaUrl, type CreatorStyle } from "../../../services/dltcafe/creator-styles";
import { startStyleJob } from "../../../services/dltcafe/style-jobs";
import { useCollabStore } from "../../editor/collab/collab-store";
import { toast } from "../../../stores/notification-store";

const MEDIA = /\.(mp4|mov|m4v|webm|mkv|wav|mp3|m4a|aac|flac|png|jpe?g|webp|gif)$/i;

/** The live sample renders at its own size (e.g. 1080×1920); scale it down to fit, like a video. */
const LiveFrame: React.FC<{ src: string; title: string; width: number; height: number; cycleClasses?: readonly string[] }> = ({ src, title, width, height, cycleClasses }) => {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  // Templates (not full samples) only show something with a body class: load the HTML and cycle them.
  const [doc, setDoc] = useState<string | null>(null);
  useEffect(() => {
    if (!cycleClasses?.length) return;
    let live = true;
    void fetch(src)
      .then((r) => r.text())
      .then((html) => {
        const script = `<script>(()=>{const c=${JSON.stringify(cycleClasses)};let i=0;const f=()=>{document.body.className=c[i++%c.length]};f();setInterval(f,1600)})()</script>`;
        if (live) setDoc(html.includes("</body>") ? html.replace("</body>", `${script}</body>`) : html + script);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [src, cycleClasses]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(Math.min(el.clientWidth / width, el.clientHeight / height));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height]);
  return (
    <div ref={box} className="relative h-[60vh] max-h-[640px] w-full overflow-hidden">
      {/* sandboxed + credentialless: the sample runs its own scripts and nothing else */}
      <iframe
        title={title}
        {...(doc ? { srcDoc: doc } : { src })}
        sandbox="allow-scripts"
        {...({ credentialless: "" } as Record<string, string>)}
        style={{ width, height, transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}
        className="absolute left-1/2 top-1/2 border-0 bg-black"
      />
    </div>
  );
};

export const StyleDetailDialog: React.FC<{ style: CreatorStyle; onClose: () => void; onJobStarted?: () => void }> = ({ style, onClose, onJobStarted }) => {
  const live = styleLiveUrl(style);
  const [tab, setTab] = useState<"preview" | "live">("preview");
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const canvas = canvasForKind(style.kind);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  const add = (list: FileList | null) => {
    const picked = [...(list ?? [])].filter((f) => MEDIA.test(f.name) && !f.name.startsWith("."));
    setFiles((cur) => [...cur, ...picked.filter((p) => !cur.some((c) => c.name === p.name && c.size === p.size))]);
  };

  const start = async () => {
    setBusy(true);
    try {
      const pathFor = window.openreel?.dltcafe?.pathForFile;
      const paths = pathFor ? files.map((f) => pathFor(f)).filter(Boolean) : [];
      const job = await startStyleJob({ styleId: style.id, files, paths: paths.length === files.length ? paths : [], name, notes });
      useCollabStore.getState().openPanel("chat");
      toast.success("Style job ready", `Ask Claude to run job ${job.id} (it's in the AI & notes panel).`);
      onClose();
      onJobStarted?.();
    } catch (error) {
      toast.error("Couldn't start the style job", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const loop = styleMediaUrl(style.media.loop);
  const poster = styleMediaUrl(style.media.poster);
  const lends = Object.entries(style.lends ?? {});

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-label={`${style.name} style`} className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-bg text-fg shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Sparkles size={18} className="text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">{style.name}</h2>
            <p className="text-[11px] text-fg-muted">{KIND_LABEL[style.kind] ?? style.kind} · {style.id}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-fg-2 hover:bg-bg-2 hover:text-fg">
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col gap-2 bg-bg-1 p-4">
            {live && (
              <div role="tablist" aria-label="Preview" className="flex gap-1">
                {(["preview", "live"] as const).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className={`rounded-md px-2.5 py-1 text-[12px] ${tab === t ? "bg-bg-3 font-medium text-fg" : "text-fg-2 hover:text-fg"}`}>
                    {t === "preview" ? "Preview" : "Live preview"}
                  </button>
                ))}
              </div>
            )}
            <div className="relative grid min-h-[320px] flex-1 place-items-center overflow-hidden rounded-xl bg-black">
              {tab === "live" && live ? (
                <LiveFrame src={live} title={`${style.name} live preview`} width={style.media.liveOptions?.width ?? canvas.width} height={style.media.liveOptions?.height ?? canvas.height} cycleClasses={style.media.liveOptions?.cycleClasses} />
              ) : loop ? (
                <video src={loop} poster={poster} autoPlay muted loop playsInline controls className="max-h-[60vh] w-full object-contain" />
              ) : poster ? (
                <img src={poster} alt="" className="max-h-[60vh] w-full object-contain" />
              ) : (
                <span className="text-[12px] text-white/60">No preview for this style yet</span>
              )}
            </div>
            {style.media.variants.length > 0 && (
              <div className="flex gap-2 overflow-x-auto">
                {style.media.variants.filter((v) => /\.(jpe?g|png|webp)$/i.test(v)).map((v) => (
                  <img key={v} src={styleMediaUrl(v)} alt={v} className="h-16 rounded-md border border-border object-cover" />
                ))}
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4 p-5">
            {style.blurb && <p className="text-[13px] leading-relaxed text-fg">{style.blurb}</p>}
            {style.cues && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">Best for</h3>
                <p className="mt-1 text-[13px] text-fg-2">{style.cues}</p>
              </div>
            )}
            {lends.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fg-3">What it brings</h3>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                  {lends.map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt className="capitalize text-fg-muted">{k}</dt>
                      <dd className="text-fg-2">{v}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </div>
            )}
            {(style.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {style.tags!.map((t) => <span key={t} className="rounded-full bg-bg-3 px-2 py-0.5 text-[11px] text-fg-2">{t}</span>)}
              </div>
            )}

            <div className="mt-auto rounded-xl border border-border bg-bg-1 p-4" data-testid="use-style">
              <h3 className="text-[13px] font-semibold">Use this style</h3>
              <p className="mt-0.5 text-[12px] text-fg-2">
                Pick your footage. OpenReel makes a {canvas.width}×{canvas.height} project with it, then Claude edits it in this style and opens it for review.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-bg-2">
                  <Film size={13} aria-hidden /> Add clips
                </button>
                <button type="button" onClick={() => folderInput.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] hover:bg-bg-2">
                  <FolderOpen size={13} aria-hidden /> Add a folder
                </button>
                <input ref={fileInput} type="file" multiple accept="video/*,audio/*,image/*" className="hidden" aria-label="Footage files" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
                <input ref={folderInput} type="file" multiple className="hidden" aria-label="Footage folder" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
              </div>
              {files.length > 0 && (
                <ul className="mt-2 max-h-24 overflow-y-auto text-[11px] text-fg-2">
                  {files.map((f) => (
                    <li key={`${f.name}-${f.size}`} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button type="button" aria-label={`Remove ${f.name}`} className="text-fg-muted hover:text-fg" onClick={() => setFiles((c) => c.filter((x) => x !== f))}>
                        <X size={11} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Project name (default: ${style.name} – today)`} aria-label="Project name"
                className="mt-3 h-8 w-full rounded-md border border-border bg-bg px-2 text-[12px] placeholder:text-fg-muted focus:border-accent focus:outline-none" />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for Claude (optional): hook idea, length, music…" aria-label="Notes for Claude" rows={2}
                className="mt-2 w-full resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-[12px] placeholder:text-fg-muted focus:border-accent focus:outline-none" />
              <button type="button" disabled={busy || files.length === 0} onClick={() => void start()}
                className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
                {busy ? "Setting up…" : files.length ? `Use this style with ${files.length} file${files.length === 1 ? "" : "s"}` : "Use this style"}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
