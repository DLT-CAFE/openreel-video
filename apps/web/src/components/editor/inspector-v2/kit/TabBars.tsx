// DLT Cafe M4 kit: top tab row + segmented sub-tab bar.
import React from "react";

export interface TabItem { readonly id: string; readonly label: string }

export const InspectorTabBar: React.FC<{ tabs: readonly TabItem[]; active: string; onSelect: (id: string) => void }> = ({ tabs, active, onSelect }) => (
  <div role="tablist" aria-label="Inspector sections" className="flex shrink-0 items-end gap-0.5 overflow-x-auto border-b border-border px-1.5 scrollbar-none">
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        role="tab"
        aria-selected={active === t.id}
        onClick={() => onSelect(t.id)}
        className={`relative h-10 shrink-0 px-1.5 text-[13px] font-medium transition-colors ${
          active === t.id ? "text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-3 hover:text-fg"
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);

export const SubTabBar: React.FC<{ tabs: readonly TabItem[]; active: string; onSelect: (id: string) => void; label: string }> = ({ tabs, active, onSelect, label }) =>
  tabs.length < 2 ? null : (
    <div className="shrink-0 px-3 pb-1 pt-2">
      <div role="tablist" aria-label={label} className="flex gap-0.5 overflow-x-auto rounded-lg bg-bg-2 p-0.5 scrollbar-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active === t.id}
            onClick={() => onSelect(t.id)}
            className={`h-7 shrink-0 grow whitespace-nowrap rounded-md px-2 text-[12px] font-medium transition-colors ${
              active === t.id ? "bg-bg-1 text-fg shadow-sm" : "text-fg-2 hover:text-fg"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
