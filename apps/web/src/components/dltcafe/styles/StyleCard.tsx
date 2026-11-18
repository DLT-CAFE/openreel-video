// DLT Cafe: one creator style: poster, the loop plays on hover, name, kind, blurb, best for, tags.
import React, { useRef, useState } from "react";
import { Sparkles, PlayCircle } from "lucide-react";
import { KIND_LABEL, styleMediaUrl, type CreatorStyle } from "../../../services/dltcafe/creator-styles";

export const StyleCard: React.FC<{ style: CreatorStyle; onOpen: (s: CreatorStyle) => void; compact?: boolean }> = ({ style, onOpen, compact }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const poster = styleMediaUrl(style.media.poster);
  const loop = styleMediaUrl(style.media.loop);
  const tall = style.kind !== "long";
  const play = (on: boolean) => {
    setHover(on);
    const v = video.current;
    if (!v) return;
    if (on) void v.play().catch(() => undefined);
    else {
      v.pause();
      v.currentTime = 0;
    }
  };
  return (
    <button
      type="button"
      data-style-id={style.id}
      aria-label={`${style.name} style`}
      onClick={() => onOpen(style)}
      onMouseEnter={() => play(true)}
      onMouseLeave={() => play(false)}
      onFocus={() => play(true)}
      onBlur={() => play(false)}
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-bg-1 text-left transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className={`relative w-full overflow-hidden bg-bg-3 ${tall ? "aspect-[4/5]" : "aspect-video"}`}>
        {poster ? (
          <img src={poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-accent/20 via-bg-2 to-bg-3 text-fg-muted">
            <Sparkles size={28} aria-hidden />
          </div>
        )}
        {loop && (
          <video
            ref={video}
            src={hover ? loop : undefined}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${hover ? "opacity-100" : "opacity-0"}`}
          />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          {KIND_LABEL[style.kind] ?? style.kind}
        </span>
        {style.media.live && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
            <PlayCircle size={11} aria-hidden /> Live
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="truncate text-[13px] font-semibold text-fg">{style.name}</span>
        {!compact && style.blurb && <span className="line-clamp-2 text-[12px] leading-snug text-fg-2">{style.blurb}</span>}
        {!compact && style.cues && (
          <span className="line-clamp-1 text-[11px] text-fg-muted">
            <span className="font-medium text-fg-3">Best for:</span> {style.cues}
          </span>
        )}
        {!compact && (style.tags?.length ?? 0) > 0 && (
          <span className="mt-auto flex flex-wrap gap-1 pt-1">
            {style.tags!.slice(0, 4).map((t) => (
              <span key={t} className="rounded-full bg-bg-3 px-1.5 py-0.5 text-[10px] text-fg-2">{t}</span>
            ))}
          </span>
        )}
      </div>
    </button>
  );
};
