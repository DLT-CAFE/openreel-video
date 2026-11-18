// DLT Cafe M3 (polish): small round button in the bottom-right corner of the
// app window that opens the Collaborate panel. Two separate indicators:
//  - top-right: count of open review notes (edit changes)
//  - bottom-right: chat status: pulsing ring while the AI is thinking or
//    working, solid dot for a chat reply you haven't seen yet.
import React, { useMemo } from "react";
import { Sparkles } from "lucide-react";
import { getReview } from "@openreel/review";
import { useProjectStore } from "../../../stores/project-store";
import { useChatStore } from "../../../stores/chat-store";
import { useCollabStore } from "./collab-store";

export function assistantReplyCount(messages: ReadonlyArray<{ role: string; text: string }>): number {
  return messages.filter((m) => m.role === "assistant" && m.text.trim().length > 0).length;
}

export const CollabLauncher: React.FC = () => {
  const { open, openPanel, tab, chatSeen } = useCollabStore();
  const review = useProjectStore((s) => s.project?.review);
  const openNotes = useMemo(() => getReview({ review }).notes.filter((n) => n.status === "open").length, [review]);
  const chatStatus = useChatStore((s) => s.status);
  const replies = useChatStore((s) => assistantReplyCount(s.messages));
  const thinking = chatStatus === "running" || chatStatus === "awaiting_confirm";
  const unread = !thinking && replies > chatSeen;
  if (open) return null;

  const parts = [
    "Open AI chat and notes",
    openNotes ? `${openNotes} open note${openNotes === 1 ? "" : "s"}` : "",
    thinking ? (chatStatus === "awaiting_confirm" ? "AI is waiting for your OK" : "AI is working") : unread ? "new AI reply" : "",
  ].filter(Boolean);
  const label = parts.join(" · ");
  const target = unread || thinking ? "chat" : openNotes ? "notes" : tab;

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid="collab-launcher"
      data-chat-state={thinking ? "thinking" : unread ? "unread" : "idle"}
      onClick={() => openPanel(target)}
      className="fixed bottom-5 right-5 z-40 grid h-10 w-10 place-items-center rounded-full bg-accent text-accent-fg shadow-lg ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Sparkles size={18} aria-hidden />
      {thinking && <span aria-hidden className="absolute inset-[-4px] animate-pulse rounded-full border-2 border-accent" />}
      {openNotes > 0 && (
        <span aria-hidden data-testid="collab-notes-badge" className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-bg bg-amber-400 px-1 text-[11px] font-bold leading-none text-black">
          {openNotes > 99 ? "99+" : openNotes}
        </span>
      )}
      {(thinking || unread) && (
        <span
          aria-hidden
          data-testid="collab-chat-dot"
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg ${thinking ? "animate-pulse bg-sky-400" : "bg-sky-500"}`}
        />
      )}
    </button>
  );
};
