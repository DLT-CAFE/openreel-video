// DLT Cafe: Settings > MCP in the browser. A tab can't host an MCP server, so
// Claude talks to the local openreel-mcp bridge and the bridge hands tool calls
// to this tab once it is paired with the code from `openreel-mcp pair`.
import React, { useState } from "react";
import { Copy, Link2, Unlink } from "@/icons/lucide-compat";
import { ToolcraftButton as Button, ToolcraftIconButton as IconButton, ToolcraftSwitchControl, ToolcraftText as Text } from "@openreel/ui";
import { useSettingsStore } from "../../../stores/settings-store";
import { toast } from "../../../stores/notification-store";
import { pairWebMcp, unpairWebMcp, useWebMcpBridge, type WebBridgeStatus } from "../../../services/dltcafe/mcp-web-bridge";

const STATUS_TEXT: Record<WebBridgeStatus, string> = {
  unpaired: "Not paired",
  connecting: "Connecting…",
  paired: "Paired: Claude can use this tab",
  waiting: "Waiting for the bridge (retrying)",
  "bad-code": "The bridge refused this code",
};

export function webConfigSnippet(cliPath: string | null): string {
  return JSON.stringify(
    { mcpServers: { openreel: { command: "node", args: [cliPath || "<path to openreel-mcp>"] } } },
    null,
    2,
  );
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed", "Clipboard is unavailable.");
  }
}

export const McpWebSection: React.FC = () => {
  const { status, code, hubCliPath, callsServed } = useWebMcpBridge();
  const [draft, setDraft] = useState("");
  const mcpAutoAllow = useSettingsStore((s) => s.mcpAutoAllowTrustedLocal);
  const setMcpAutoAllow = useSettingsStore((s) => s.setMcpAutoAllowTrustedLocal);
  const ok = status === "paired";
  const snippet = webConfigSnippet(hubCliPath);

  return (
    <div className="min-w-0 max-w-full space-y-6" data-testid="mcp-web-section">
      <div className="space-y-4">
        <div>
          <Text type="body" color="primary" className="block text-sm font-medium">MCP in the browser</Text>
          <Text type="supporting" color="secondary" className="mt-0.5 block text-xs">
            Claude connects to the local <code>openreel-mcp</code> bridge on this computer. The bridge uses the
            desktop app when it is open, otherwise this tab. It listens on 127.0.0.1 only, and a tab must be
            paired before it can take tool calls.
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <Text type="supporting" color="secondary" className="w-20 shrink-0 text-xs">Status</Text>
          <Text type="supporting" className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? "text-status-success" : status === "bad-code" ? "text-status-error" : "text-text-muted"}`}>
            <i aria-hidden className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-status-success" : status === "bad-code" ? "bg-status-error" : "bg-text-muted"}`} />
            <span data-testid="mcp-web-status">{STATUS_TEXT[status]}</span>
          </Text>
        </div>
        {ok && (
          <div className="flex items-center gap-2">
            <Text type="supporting" color="secondary" className="w-20 shrink-0 text-xs">Tool calls</Text>
            <Text type="supporting" color="secondary" className="text-xs">{callsServed} served by this tab</Text>
          </div>
        )}

        {code ? (
          <div className="flex items-center gap-2">
            <Text type="supporting" color="secondary" className="w-20 shrink-0 text-xs">Code</Text>
            <code className="flex-1 truncate rounded bg-background px-3 py-2 font-mono text-xs text-text-secondary">{code.replace(/[0-9a-f]/gi, "•")}</code>
            <Button label="Unpair" size="sm" variant="secondary" icon={<Unlink size={14} aria-hidden />} onClick={unpairWebMcp} />
          </div>
        ) : null}

        {(!code || status === "bad-code") && (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              pairWebMcp(draft);
              setDraft("");
            }}
          >
            <Text type="supporting" color="secondary" className="w-20 shrink-0 text-xs">Pairing code</Text>
            <input
              aria-label="Pairing code"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              className="flex-1 rounded border border-border bg-background px-3 py-1.5 font-mono text-xs text-text-primary"
              autoComplete="off"
              spellCheck={false}
            />
            <Button label="Pair this tab" size="sm" variant="primary" type="submit" icon={<Link2 size={14} aria-hidden />} isDisabled={!draft.trim()} />
          </form>
        )}
        <Text type="supporting" color="secondary" className="block text-xs">
          Get the code by running <code>openreel-mcp pair</code> in Terminal (or ask Claude to run it). The code
          stays valid until it is reset, so you only pair once per browser.
        </Text>
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-3">
        <div>
          <Text type="body" color="primary" className="block text-sm font-medium">Client setup</Text>
          <Text type="supporting" color="secondary" className="mt-0.5 block text-xs">
            Add this to Claude Desktop (or <code>claude mcp add openreel -s user -- node &lt;path&gt;</code> for Claude Code).
            The same entry works for the desktop app and the browser.
          </Text>
        </div>
        <div className="relative">
          <pre className="whitespace-pre-wrap break-all rounded pr-10 bg-background px-3 py-2 font-mono text-[11px] text-text-secondary">{snippet}</pre>
          <IconButton label="Copy config" onClick={() => copy(snippet, "Config")} variant="ghost" size="sm" icon={<Copy size={14} aria-hidden />} className="absolute right-2 top-2 text-text-muted hover:bg-background-tertiary hover:text-text-primary" />
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <Text type="supporting" color="secondary" className="block text-sm">Auto-allow destructive actions</Text>
          <Text type="supporting" color="secondary" className="mt-0.5 block max-w-md text-xs">
            When off, destructive or expensive tool calls over MCP are refused with a confirmation-required notice.
          </Text>
        </div>
        <ToolcraftSwitchControl ariaLabel="Auto-allow destructive actions" checked={mcpAutoAllow} onCheckedChange={setMcpAutoAllow} showLabel={false} />
      </div>
    </div>
  );
};
