// DLT Cafe: after a reload, big linked files may need the person's OK again
// before the browser lets us read them. This banner asks in one click.
import React, { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { toast } from "../../../stores/notification-store";
import { findLinkedPlaceholders, regainAccess, type LinkedNeedingAccess } from "../../../services/dltcafe/linked-media";

const relink = (id: string, file: File) => useProjectStore.getState().replaceMediaAsset(id, file, undefined);

export const LinkedMediaBanner: React.FC = () => {
  const items = useProjectStore((s) => s.project?.mediaLibrary?.items);
  const [needs, setNeeds] = useState<LinkedNeedingAccess[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!items?.some((i) => i.isPlaceholder)) {
      setNeeds([]);
      return;
    }
    void findLinkedPlaceholders(items).then(async ({ ready, needAccess }) => {
      if (cancelled) return;
      setNeeds(needAccess);
      // Linked files the browser can still read reconnect on their own.
      if (ready.length) {
        const { relinked } = await regainAccess(ready, relink);
        if (relinked) toast.success("Linked media", `${relinked} linked file${relinked === 1 ? "" : "s"} reconnected`);
      }
    });
    return () => { cancelled = true; };
  }, [items]);

  if (needs.length === 0) return null;

  const allow = async () => {
    setBusy(true);
    try {
      const { relinked, denied } = await regainAccess(needs, relink);
      if (relinked) toast.success("Linked media", `${relinked} file${relinked === 1 ? "" : "s"} reconnected`);
      if (denied) toast.warning("Linked media", `${denied} file${denied === 1 ? "" : "s"} still need access. Click Allow again, or relink them.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-fg-2">
      <HardDrive size={14} className="shrink-0 text-amber-500" aria-hidden />
      <span className="min-w-0 flex-1">
        {needs.length} linked file{needs.length === 1 ? "" : "s"} on this computer need{needs.length === 1 ? "s" : ""} your OK to open again.
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void allow()}
        className="shrink-0 rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-accent-fg hover:bg-accent/90 disabled:opacity-50"
      >
        Allow access
      </button>
    </div>
  );
};
