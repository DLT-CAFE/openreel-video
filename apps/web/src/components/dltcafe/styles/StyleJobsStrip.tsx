// DLT Cafe: style jobs for the open project, at the top of the AI & notes panel's Chat tab.
import React from "react";
import { Copy, Sparkles } from "lucide-react";
import { jobRequest, useStyleJobs, type StyleJobStatus } from "../../../services/dltcafe/style-jobs";
import { useProjectStore } from "../../../stores/project-store";
import { toast } from "../../../stores/notification-store";

const STATUS: Record<StyleJobStatus, { label: string; cls: string }> = {
  waiting: { label: "Waiting for Claude", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "in-progress": { label: "Claude is editing", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
  "in-review": { label: "Ready to review", cls: "bg-accent/15 text-accent" },
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", cls: "bg-bg-3 text-fg-muted" },
};

export const StyleJobsStrip: React.FC = () => {
  const projectId = useProjectStore((s) => (s.hasOpenProject ? s.project.id : null));
  const jobs = useStyleJobs((s) => s.jobs.filter((j) => j.projectId === projectId && j.status !== "cancelled"));
  if (!jobs.length) return null;
  return (
    <div className="shrink-0 space-y-2 border-b border-border px-3 py-2" data-testid="style-jobs">
      {jobs.slice(0, 2).map((job) => (
        <div key={job.id} className="rounded-lg border border-border bg-bg-1 p-2">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-accent" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-fg">{job.styleName}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS[job.status].cls}`}>{STATUS[job.status].label}</span>
          </div>
          <p className="mt-1 text-[11px] text-fg-2">
            Job {job.id} · {job.footage.length} file{job.footage.length === 1 ? "" : "s"}
            {job.message ? ` · ${job.message}` : ""}
          </p>
          {job.status === "waiting" && (
            <div className="mt-1.5 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg hover:bg-bg-2"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(jobRequest(job))
                    .then(() => toast.success("Copied", "Paste it to Claude (Claude Code or Claude Desktop)."))
                    .catch(() => toast.error("Copy failed", "Clipboard is unavailable."));
                }}
              >
                <Copy size={11} aria-hidden /> Copy request for Claude
              </button>
              <span className="text-[10px] text-fg-muted">or Claude finds it with list_style_jobs</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
