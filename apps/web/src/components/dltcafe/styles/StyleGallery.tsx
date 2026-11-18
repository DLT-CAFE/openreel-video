// DLT Cafe: the creator styles gallery (home screen and the editor's Styles panel):
// search, filter by kind and tag, read live from the local pack folder.
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, Sparkles } from "lucide-react";
import { filterStyles, KIND_LABEL, useCreatorStyles, type CreatorStyle } from "../../../services/dltcafe/creator-styles";
import { StyleCard } from "./StyleCard";
import { StyleDetailDialog } from "./StyleDetailDialog";

export const StyleGallery: React.FC<{
  /** Called after "Use this style" created the project (e.g. go to the editor). */
  onJobStarted?: () => void;
  limit?: number;
  compact?: boolean;
  columns?: string;
  initialQuery?: string;
  hideToolbar?: boolean;
}> = ({ onJobStarted, limit, compact, columns, initialQuery = "", hideToolbar }) => {
  const { status, index, error, load } = useCreatorStyles();
  const [query, setQuery] = useState(initialQuery);
  const [kind, setKind] = useState("");
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState<CreatorStyle | null>(null);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const styles = index?.styles ?? [];
  const kinds = useMemo(() => [...new Set(styles.map((s) => s.kind))], [styles]);
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of styles) for (const t of s.tags ?? []) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [styles]);
  const shown = filterStyles(styles, { query, kind, tag });
  const list = limit ? shown.slice(0, limit) : shown;

  if (status === "unpaired" || status === "error") {
    return (
      <div className="rounded-xl border border-dashed border-border bg-bg-1 p-6 text-center" data-testid="styles-unavailable">
        <Sparkles className="mx-auto mb-2 text-fg-muted" size={24} aria-hidden />
        <p className="text-[13px] font-medium text-fg">Creator styles aren't loaded</p>
        <p className="mx-auto mt-1 max-w-md text-[12px] text-fg-2">{error}</p>
        <button type="button" className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-fg hover:bg-bg-2" onClick={() => void load(true)}>
          <RefreshCw size={13} aria-hidden /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="style-gallery">
      {!hideToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[180px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search styles: podcast, ranking, b-roll…"
              aria-label="Search styles"
              className="h-8 w-full rounded-md border border-border bg-bg-1 pl-8 pr-2 text-[13px] text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none"
            />
          </label>
          <div role="radiogroup" aria-label="Kind" className="flex rounded-md border border-border bg-bg-1 p-0.5">
            {["", ...kinds].map((k) => (
              <button
                key={k || "all"}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`h-7 rounded px-2.5 text-[12px] ${kind === k ? "bg-bg-3 font-medium text-fg" : "text-fg-2 hover:text-fg"}`}
              >
                {k ? KIND_LABEL[k] ?? k : "All"}
              </button>
            ))}
          </div>
          <select
            aria-label="Tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="h-8 rounded-md border border-border bg-bg-1 px-2 text-[12px] text-fg"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <button type="button" aria-label="Reload styles" title="Reload styles (new ones appear here)" onClick={() => void load(true)} className="grid h-8 w-8 place-items-center rounded-md border border-border text-fg-2 hover:bg-bg-2 hover:text-fg">
            <RefreshCw size={14} aria-hidden className={status === "loading" ? "animate-spin" : ""} />
          </button>
        </div>
      )}
      {status === "loading" && !index ? (
        <div className="py-10 text-center text-[12px] text-fg-muted">Loading creator styles…</div>
      ) : list.length === 0 ? (
        <div className="py-10 text-center text-[12px] text-fg-muted">No styles match.</div>
      ) : (
        <div className={`grid gap-3 ${columns ?? "grid-cols-[repeat(auto-fill,minmax(180px,1fr))]"}`}>
          {list.map((s) => (
            <StyleCard key={s.id} style={s} onOpen={setOpen} compact={compact} />
          ))}
        </div>
      )}
      {!hideToolbar && index && (
        <p className="text-[11px] text-fg-muted">
          {shown.length} of {styles.length} styles · from {index.root}
        </p>
      )}
      {open && <StyleDetailDialog style={open} onClose={() => setOpen(null)} onJobStarted={onJobStarted} />}
    </div>
  );
};
