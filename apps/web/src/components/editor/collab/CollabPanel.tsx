// DLT Cafe M3: the Collaborate panel body: one header (Chat | Notes, dock/float,
// close) over the existing AI chat and the review notes.
import React, { Suspense, lazy, useEffect, useMemo } from "react";
import { StyleJobsStrip } from "../../dltcafe/styles/StyleJobsStrip"; // DLT Cafe
import { MessageSquareText, PanelRightClose, PictureInPicture2, Sparkles, X } from "lucide-react";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { ReviewPanel } from "../review/ReviewPanel";
import { useCollabStore } from "./collab-store";
import { useChatStore } from "../../../stores/chat-store";
import { assistantReplyCount } from "./CollabLauncher";
import { DockGrip } from "../shell/dock-drag";

const ChatPanel = lazy(() => import("../chat/ChatPanel").then((m) => ({ default: m.ChatPanel })));

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-md text-fg-2 hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export const CollabPanel: React.FC<{ onHeaderPointerDown?: (e: React.PointerEvent) => void }> = ({ onHeaderPointerDown }) => {
  const { tab, mode, setTab, setMode, close } = useCollabStore();
  const review = useProjectStore((s) => s.project?.review);
  const openNotes = useMemo(() => getReview({ review }).notes.filter((n) => n.status === "open").length, [review]);
  const replies = useChatStore((s) => assistantReplyCount(s.messages));
  const markChatSeen = useCollabStore((s) => s.markChatSeen);
  // Seeing the chat tab clears the launcher's unread dot.
  useEffect(() => { if (tab === "chat") markChatSeen(replies); }, [tab, replies, markChatSeen]);

  return (
    <section aria-label="Collaborate" className="flex h-full min-h-0 flex-col bg-bg-1 text-[13px]">
      <header
        className={`flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 ${mode === "floating" ? "cursor-move" : ""}`}
        onPointerDown={onHeaderPointerDown}
      >
        <div role="tablist" aria-label="Collaborate" className="flex rounded-lg bg-bg-2 p-1" onPointerDown={(e) => e.stopPropagation()}>
          {([
            ["chat", "Chat", <Sparkles key="i" size={14} aria-hidden />],
            ["notes", "Notes", <MessageSquareText key="i" size={14} aria-hidden />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium ${tab === id ? "bg-bg-1 text-fg shadow-sm" : "text-fg-2 hover:text-fg"}`}
            >
              {icon}
              {label}
              {id === "notes" && openNotes > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-fg">{openNotes}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {mode === "docked" && <span onPointerDown={(e) => e.stopPropagation()}><DockGrip panel="collab" /></span>}
        <button
          type="button"
          className={iconBtn}
          aria-label={mode === "docked" ? "Float panel" : "Dock panel"}
          title={mode === "docked" ? "Float panel" : "Dock panel"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setMode(mode === "docked" ? "floating" : "docked")}
        >
          {mode === "docked" ? <PictureInPicture2 size={16} aria-hidden /> : <PanelRightClose size={16} aria-hidden />}
        </button>
        <button type="button" className={iconBtn} aria-label="Close panel" title="Close" onPointerDown={(e) => e.stopPropagation()} onClick={close}>
          <X size={16} aria-hidden />
        </button>
      </header>
      <p className="shrink-0 border-b border-border px-3 py-1.5 text-[12px] text-fg-3" data-testid="collab-purpose">
        {tab === "chat"
          ? "Plan & brainstorm with the AI: ideas, project setup, questions."
          : "Edit changes: pin notes to the timeline, then send them to Claude."}
      </p>
      <div className="min-h-0 flex-1" role="tabpanel">
        {tab === "chat" ? (
          <div className="flex h-full min-h-0 flex-col">
            <StyleJobsStrip />{/* DLT Cafe: creator style jobs for this project */}
            <div className="min-h-0 flex-1">
              <Suspense fallback={<div className="grid h-full place-items-center text-fg-muted">Loading AI chat…</div>}>
                <ChatPanel />
              </Suspense>
            </div>
          </div>
        ) : (
          <ReviewPanel />
        )}
      </div>
    </section>
  );
};
