// DLT Cafe: review panel. Timestamped notes anchored to the clip under the
// playhead, threaded replies, open/done, "Send notes to Claude" and "Approve".
// Shared by the browser app and the desktop app (same renderer).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, CornerDownRight, MessageSquareText, RotateCcw, Send, Trash2, X } from "lucide-react";
import { clipAtTime, describeAnchor, getReview, sortedNotes, summarize, type ReviewNote } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { getPlaybackBridge } from "../../../bridges/playback-bridge";
import { toast } from "../../../stores/notification-store";
import { formatReviewTime, timeAgo, useReviewUIStore } from "./review-ui-store";

type Filter = "open" | "done" | "all";

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-bg-2 px-2.5 py-1.5 text-[11px] font-medium text-fg-2 hover:bg-bg-3 hover:text-fg focus-visible:outline focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40";
const primaryBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[11px] font-semibold text-accent-fg hover:bg-accent/90 focus-visible:outline focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40";
const iconBtn =
  "grid h-6 w-6 place-items-center rounded text-fg-muted hover:bg-bg-3 hover:text-fg focus-visible:outline focus-visible:outline-accent";
const input =
  "w-full resize-none rounded-md border border-border bg-bg-2 px-2 py-1.5 text-[12px] text-fg placeholder:text-fg-muted select-text focus:outline-none focus:ring-1 focus:ring-accent";

function seek(t: number) {
  try {
    getPlaybackBridge().scrubTo(t);
  } catch {
    useTimelineStore.getState().seekTo(t);
  }
}

function run(fn: () => void) {
  try {
    fn();
  } catch (error) {
    toast.error("Review", error instanceof Error ? error.message : String(error));
  }
}

const STATUS_LABEL = { draft: "Draft", changes_requested: "Changes requested", approved: "Approved" } as const;
const STATUS_CLASS = {
  draft: "bg-bg-3 text-fg-2",
  changes_requested: "bg-amber-500/15 text-amber-500",
  approved: "bg-emerald-500/15 text-emerald-500",
} as const;

export const ReviewPanel: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const project = useProjectStore((s) => s.project);
  const hasOpenProject = useProjectStore((s) => s.hasOpenProject);
  const playhead = useTimelineStore((s) => s.playheadPosition);
  const { focusedNoteId, focusNote } = useReviewUIStore();
  const review = useMemo(() => getReview(project), [project]);
  const summary = useMemo(() => summarize(review), [review]);
  const [filter, setFilter] = useState<Filter>("open");
  const [draft, setDraft] = useState("");
  const [, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Refresh the "x min ago" labels.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const anchorHere = useMemo(() => clipAtTime(project, playhead), [project, playhead]);
  const notes = useMemo(
    () => sortedNotes(review.notes).filter((n) => filter === "all" || n.status === filter),
    [review.notes, filter],
  );

  useEffect(() => {
    if (!focusedNoteId) return;
    const note = review.notes.find((n) => n.id === focusedNoteId);
    if (note && filter !== "all" && note.status !== filter) setFilter("all");
    const el = listRef.current?.querySelector<HTMLElement>(`[data-note-id="${CSS.escape(focusedNoteId)}"]`);
    el?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [focusedNoteId, review.notes, filter]);

  const addNote = () =>
    run(() => {
      const note = useProjectStore.getState().addReviewNote({
        t: playhead,
        text: draft,
        ...(anchorHere ? { clipId: anchorHere.clipId } : {}),
      });
      setDraft("");
      if (filter === "done") setFilter("open");
      focusNote(note.id);
    });

  if (!hasOpenProject) {
    return <div className="grid h-full place-items-center p-4 text-center text-xs text-fg-muted">Open a project to leave review notes.</div>;
  }

  return (
    <section aria-label="Review notes" className="flex h-full min-h-0 flex-col text-xs">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageSquareText size={14} className="text-fg-2" aria-hidden />
        <h2 className="text-[13px] font-semibold text-fg">Review</h2>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLASS[summary.approval]}`} data-testid="review-status">
          {STATUS_LABEL[summary.approval]}
        </span>
        <div className="flex-1" />
        {onClose && (
          <button type="button" className={iconBtn} aria-label="Close review panel" onClick={onClose}>
            <X size={14} aria-hidden />
          </button>
        )}
      </header>

      <div className="space-y-1.5 border-b border-border px-3 py-2.5">
        <div className="text-[11px] text-fg-2">
          Note at <button type="button" className="font-mono text-accent hover:underline" onClick={() => seek(playhead)}>{formatReviewTime(playhead)}</button>
          {anchorHere?.mediaName ? <> on <span className="text-fg">{anchorHere.mediaName}</span></> : null}
        </div>
        <textarea
          aria-label="New review note"
          rows={2}
          className={`${input} min-h-[2.75rem]`}
          value={draft}
          placeholder="What should change here? (⌘↵ to add)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation(); // keep editor shortcuts (space, J/K/L, S...) out of the text box
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) {
              e.preventDefault();
              addNote();
            }
          }}
        />
        {draft.trim() && (
          <div className="flex justify-end">
            <button type="button" className={primaryBtn} onClick={addNote}>
              Add note
            </button>
          </div>
        )}
      </div>

      <div role="tablist" aria-label="Filter notes" className="flex gap-1 px-3 pt-2">
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            type="button"
            className={`rounded-md px-2 py-1 text-[11px] ${filter === f ? "bg-bg-3 text-fg" : "text-fg-muted hover:text-fg"}`}
            onClick={() => setFilter(f)}
          >
            {f === "open" ? `Open ${summary.open}` : f === "done" ? `Done ${summary.done}` : `All ${summary.total}`}
          </button>
        ))}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-2">
        {notes.length === 0 ? (
          <p className="py-6 text-center text-[11px] leading-relaxed text-fg-muted">
            {filter === "open"
              ? "No open notes. Move the playhead, type a note and press Add note."
              : "Nothing here yet."}
          </p>
        ) : (
          notes.map((note) => (
            <NoteCard key={note.id} note={note} focused={note.id === focusedNoteId} onFocus={() => focusNote(note.id)} />
          ))
        )}
      </div>

      <footer className="space-y-2 border-t border-border px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-fg-muted" data-testid="review-footer-status">
          {summary.approval === "approved"
            ? `Approved ${timeAgo(review.approval.at)}.`
            : summary.approval === "changes_requested"
              ? summary.waitingForClaude
                ? `Sent to Claude ${timeAgo(review.sentAt)}. Waiting for Claude to pick them up.`
                : `Claude read the notes ${timeAgo(review.claudeSeenAt)}. ${summary.unanswered ? `${summary.unanswered} still unanswered.` : "All answered."}`
              : summary.open
                ? `${summary.open} open note${summary.open === 1 ? "" : "s"}. Send them to Claude when you're done.`
                : "Leave notes as you watch, then send them to Claude."}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className={`${primaryBtn} flex-1`}
            disabled={summary.open === 0}
            onClick={() => run(() => { useProjectStore.getState().sendReviewToClaude(); toast.success("Review", "Notes sent to Claude"); })}
          >
            <Send size={12} aria-hidden /> Send notes to Claude
          </button>
          {summary.approval === "approved" ? (
            <button type="button" className={btn} onClick={() => run(() => useProjectStore.getState().reopenReview())}>
              <RotateCcw size={12} aria-hidden /> Reopen
            </button>
          ) : (
            <button
              type="button"
              className={btn}
              onClick={() => run(() => { useProjectStore.getState().approveReview(); toast.success("Review", "Edit approved"); })}
              title={summary.open ? `${summary.open} note(s) are still open` : undefined}
            >
              <Check size={12} aria-hidden /> Approve
            </button>
          )}
        </div>
      </footer>
    </section>
  );
};

const NoteCard: React.FC<{ note: ReviewNote; focused: boolean; onFocus: () => void }> = ({ note, focused, onFocus }) => {
  const project = useProjectStore((s) => s.project);
  const anchor = useMemo(() => describeAnchor(project, note), [project, note]);
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const done = note.status === "done";

  const sendReply = () =>
    run(() => {
      useProjectStore.getState().replyReviewNote(note.id, reply);
      setReply("");
      setReplying(false);
    });

  return (
    <article
      data-note-id={note.id}
      aria-label={`Note at ${formatReviewTime(note.t)}`}
      className={`rounded-lg border p-2 transition-colors ${focused ? "border-accent bg-accent/5" : "border-border bg-bg-2/40"} ${done ? "opacity-70" : ""}`}
      onClick={onFocus}
    >
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded bg-bg-3 px-1.5 py-0.5 font-mono text-[10px] text-accent hover:underline"
          onClick={(e) => { e.stopPropagation(); onFocus(); seek(note.t); }}
          aria-label={`Jump to ${formatReviewTime(note.t)}`}
        >
          {formatReviewTime(note.t)}{note.t1 !== undefined ? `–${formatReviewTime(note.t1)}` : ""}
        </button>
        <span className="min-w-0 flex-1 truncate text-[10px] text-fg-muted">
          {anchor && "missing" in anchor ? "clip removed" : anchor?.mediaName ?? ""}
        </span>
        {note.author === "claude" && <span className="rounded bg-accent/15 px-1 text-[9px] font-semibold text-accent">Claude</span>}
        <button
          type="button"
          className={`${iconBtn} ${done ? "text-emerald-500" : ""}`}
          aria-label={done ? "Reopen note" : "Mark note done"}
          aria-pressed={done}
          onClick={(e) => { e.stopPropagation(); run(() => useProjectStore.getState().setReviewNoteStatus(note.id, done ? "open" : "done")); }}
        >
          <Check size={13} aria-hidden />
        </button>
        <button
          type="button"
          className={iconBtn}
          aria-label="Delete note"
          onClick={(e) => { e.stopPropagation(); run(() => useProjectStore.getState().deleteReviewNote(note.id)); }}
        >
          <Trash2 size={12} aria-hidden />
        </button>
      </div>
      <p className={`mt-1 whitespace-pre-wrap break-words text-[12px] leading-snug select-text ${done ? "text-fg-2 line-through decoration-fg-muted/50" : "text-fg"}`}>{note.text}</p>

      {note.replies.length > 0 && (
        <ol className="mt-1.5 space-y-1 border-l-2 border-border pl-2">
          {note.replies.map((r) => (
            <li key={r.id} className="text-[11px] leading-snug">
              <span className={`font-semibold ${r.author === "claude" ? "text-accent" : "text-fg-2"}`}>{r.author === "claude" ? "Claude" : "You"}</span>{" "}
              <span className="whitespace-pre-wrap break-words text-fg-2 select-text">{r.text}</span>
            </li>
          ))}
        </ol>
      )}

      {replying ? (
        <div className="mt-1.5 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            aria-label="Reply"
            className={`${input} h-12`}
            value={reply}
            placeholder="Reply… (⌘↵)"
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) { e.preventDefault(); sendReply(); }
              if (e.key === "Escape") setReplying(false);
            }}
          />
          <button type="button" className={btn} disabled={!reply.trim()} onClick={sendReply}>Reply</button>
        </div>
      ) : (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-[10px] text-fg-muted hover:text-fg"
          onClick={(e) => { e.stopPropagation(); setReplying(true); }}
        >
          <CornerDownRight size={11} aria-hidden /> Reply
        </button>
      )}
    </article>
  );
};
