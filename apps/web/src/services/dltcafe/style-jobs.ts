// DLT Cafe: "Use this style" jobs. OpenReel doesn't re-implement the creator
// styles: it sets up a project with the right canvas and the footage, then hands
// the job to Claude (Collaborate panel + MCP list_style_jobs). Claude runs the
// style's skill, loads the result (import_portable_edit / register_review.py)
// and the edit opens for review.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setReviewContext } from "@openreel/review";
import { useProjectStore } from "../../stores/project-store";
import { importLocalMediaFile } from "../agent/dltcafe/local-media-import";
import { canvasForKind, useCreatorStyles, type CreatorStyle } from "./creator-styles";

export type StyleJobStatus = "waiting" | "in-progress" | "in-review" | "done" | "cancelled";

export interface StyleJob {
  readonly id: string;
  readonly styleId: string;
  readonly styleName: string;
  readonly kind: string;
  readonly projectId: string;
  readonly projectName: string;
  /** Absolute paths (desktop) or file names (browser: Claude must ask where they are). */
  readonly footage: readonly string[];
  readonly footageHasPaths: boolean;
  readonly notes?: string;
  readonly status: StyleJobStatus;
  readonly reviewId?: string;
  readonly message?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface JobsState {
  jobs: StyleJob[];
  upsert: (job: StyleJob) => void;
  update: (id: string, patch: Partial<Pick<StyleJob, "status" | "reviewId" | "message">>) => StyleJob | null;
}

export const useStyleJobs = create<JobsState>()(
  persist(
    (set, get) => ({
      jobs: [],
      upsert: (job) => set((s) => ({ jobs: [job, ...s.jobs.filter((j) => j.id !== job.id)].slice(0, 200) })),
      update: (id, patch) => {
        const job = get().jobs.find((j) => j.id === id);
        if (!job) return null;
        const next: StyleJob = { ...job, ...patch, updatedAt: new Date().toISOString() };
        set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? next : j)) }));
        return next;
      },
    }),
    { name: "dltcafe-style-jobs" },
  ),
);

/** What to ask Claude (Claude Code / Claude Desktop) to run the job. */
export function jobRequest(job: StyleJob): string {
  const files = job.footageHasPaths ? job.footage.map((f) => `  - ${f}`).join("\n") : `  (picked in the browser: ${job.footage.join(", ")}; tell Claude where these files are)`;
  return (
    `Edit these clips in the "${job.styleName}" style (OpenReel style job ${job.id}):\n${files}\n` +
    `${job.notes ? `Notes: ${job.notes}\n` : ""}` +
    `Use the ${job.styleId} skill, then put the preview up for review in OpenReel ` +
    `(register_review.py --id ${job.id} --style ${job.styleId}) and mark the job in review (update_style_job).`
  );
}

function newJobId(styleId: string): string {
  const short = styleId.split("-").map((w) => w[0]).join("").slice(0, 4) || "job";
  return `${short}-${Date.now().toString(36)}`;
}

export interface StartStyleJobInput {
  readonly styleId: string;
  /** Desktop/MCP: absolute paths. */
  readonly paths?: readonly string[];
  /** UI: picked files, imported into the project. With paths (desktop) Claude gets those too. */
  readonly files?: readonly File[];
  readonly name?: string;
  readonly notes?: string;
}

/** Creates the project (canvas from the style's kind), imports the footage and records the job. */
export async function startStyleJob(input: StartStyleJobInput): Promise<StyleJob> {
  const index = await useCreatorStyles.getState().load();
  const style: CreatorStyle | undefined = index?.styles.find((s) => s.id === input.styleId || (s.aliases ?? []).includes(input.styleId));
  if (!style) throw new Error(`Unknown creator style "${input.styleId}"`);
  const paths = [...(input.paths ?? [])];
  const files = [...(input.files ?? [])];
  if (paths.length === 0 && files.length === 0) throw new Error("Pick the footage for this style first");

  const id = newJobId(style.id);
  const projectName = input.name?.trim() || `${style.name} – ${new Date().toLocaleDateString()}`;
  const store = useProjectStore.getState();
  store.createNewProject(projectName, { ...canvasForKind(style.kind), frameRate: 30 });
  const project = useProjectStore.getState().project;

  // Picked files are imported as files (works from any folder); paths alone (MCP) go through the
  // approved-folder import. Either way Claude gets the paths to run the style's skill on.
  if (files.length) for (const f of files) await useProjectStore.getState().importMedia(f);
  else for (const p of paths) await importLocalMediaFile(p);
  // Tag the project's review with the style, so the review later knows what it was made in.
  useProjectStore.getState().updateReview((r) => setReviewContext(r, { title: projectName, styleId: style.id, reviewId: id }));
  await useProjectStore.getState().forceSave().catch(() => undefined);

  const now = new Date().toISOString();
  const job: StyleJob = {
    id,
    styleId: style.id,
    styleName: style.name,
    kind: style.kind,
    projectId: project.id,
    projectName,
    footage: paths.length ? paths : files.map((f) => f.name),
    footageHasPaths: paths.length > 0,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    status: "waiting",
    createdAt: now,
    updatedAt: now,
  };
  useStyleJobs.getState().upsert(job);
  return job;
}
