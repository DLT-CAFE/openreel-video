// DLT Cafe M4 kit: parameter row: label | full-width slider | compact number
// box with stepper | optional keyframe diamond. 13px, 32px tall.
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface ParamRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
  disabled?: boolean;
  description?: string;
  trailing?: React.ReactNode;
}

const decimals = (step: number) => (String(step).split(".")[1]?.length ?? 0);

export const ParamRow: React.FC<ParamRowProps> = ({ label, value, min, max, step = 1, onChange, formatValue, disabled, description, trailing }) => {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (raw: string) => {
    const n = Number.parseFloat(raw.replace(/[^0-9.+-eE]/g, ""));
    if (Number.isFinite(n)) onChange(clamp(n));
    setDraft(null);
  };
  const bump = (dir: 1 | -1) => onChange(clamp(Number((value + dir * step).toFixed(decimals(step)))));
  const id = React.useId();
  return (
    <div className="py-1" data-v2-param="">
      <div className="flex h-8 items-center gap-2">
        <label htmlFor={id} className="w-[88px] shrink-0 truncate text-[13px] text-fg-2" title={label}>{label}</label>
        <input
          id={id}
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)] disabled:opacity-40"
        />
        <div className="flex h-7 w-[72px] shrink-0 items-stretch overflow-hidden rounded-md border border-border-strong bg-bg-2 focus-within:ring-1 focus-within:ring-accent">
          <input
            aria-label={`${label} value`}
            disabled={disabled}
            value={draft ?? (formatValue ? formatValue(value) : String(value))}
            onFocus={(e) => { setDraft(String(Number(value.toFixed(decimals(step) + 2)))); e.currentTarget.select(); }}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") { setDraft(null); (e.currentTarget as HTMLInputElement).blur(); }
              if (e.key === "ArrowUp") { e.preventDefault(); bump(1); }
              if (e.key === "ArrowDown") { e.preventDefault(); bump(-1); }
            }}
            className="min-w-0 flex-1 bg-transparent px-1.5 text-right font-mono text-[12px] text-fg outline-none disabled:opacity-40"
          />
          <div className="flex w-4 flex-col border-l border-border">
            <button type="button" tabIndex={-1} aria-label={`Increase ${label}`} disabled={disabled} onClick={() => bump(1)} className="grid flex-1 place-items-center text-fg-3 hover:bg-hover hover:text-fg"><ChevronUp size={10} aria-hidden /></button>
            <button type="button" tabIndex={-1} aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => bump(-1)} className="grid flex-1 place-items-center border-t border-border text-fg-3 hover:bg-hover hover:text-fg"><ChevronDown size={10} aria-hidden /></button>
          </div>
        </div>
        {trailing}
      </div>
      {description ? <p className="pl-[96px] text-[12px] text-fg-3">{description}</p> : null}
    </div>
  );
};
