// DLT Cafe: lets a browser tab serve OpenReel's MCP tools. The tab connects to
// the local openreel-mcp hub (packages/mcp-bridge) over a loopback WebSocket,
// proves it is paired with the code from `openreel-mcp pair`, then answers tool
// calls through the same handler the desktop app uses (mcp-listener.ts), so
// confirmations ("Trusted local") and the tool registry are shared.
import { create } from "zustand";
import type { McpBridgeRequest } from "../agent/mcp-listener";

export const DEFAULT_HUB_PORT = 47615;
const CODE_KEY = "dltcafe-mcp-pair";
const PORT_KEY = "dltcafe-mcp-hub-port";

export type WebBridgeStatus =
  | "unpaired" // no pairing code saved
  | "connecting"
  | "paired" // connected and serving tool calls
  | "waiting" // code saved, hub not running yet: retrying
  | "bad-code"; // hub refused the code

interface WebBridgeState {
  status: WebBridgeStatus;
  code: string | null;
  port: number;
  hubCliPath: string | null;
  callsServed: number;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // private mode: pairing lasts for this tab only
  }
}

const initialCode = readStorage(CODE_KEY);
const initialPort = Number(readStorage(PORT_KEY)) || DEFAULT_HUB_PORT;

export const useWebMcpBridge = create<WebBridgeState>(() => ({
  status: initialCode ? "connecting" : "unpaired",
  code: initialCode,
  port: initialPort,
  hubCliPath: null,
  callsServed: 0,
}));

type Handler = (req: McpBridgeRequest) => Promise<{ ok: boolean; result?: unknown; error?: string }>;

let socket: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
let handler: Handler | null = null;
let installed = false;

function clearRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(): void {
  clearRetry();
  retryTimer = setTimeout(connect, retryDelay);
  retryDelay = Math.min(retryDelay * 1.5, 15_000);
}

async function loadHandler(): Promise<Handler> {
  if (!handler) handler = (await import("../agent/mcp-listener")).handleMcpBridgeRequest;
  return handler;
}

async function fetchHubInfo(port: number): Promise<void> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const info = (await res.json()) as { cliPath?: string };
    useWebMcpBridge.setState({ hubCliPath: info.cliPath ?? null });
  } catch {
    // hub not running
  }
}

function connect(): void {
  clearRetry();
  const { code, port } = useWebMcpBridge.getState();
  if (!code) return;
  socket?.close();
  useWebMcpBridge.setState((s) => ({ status: s.status === "paired" ? "connecting" : s.status === "waiting" ? "waiting" : "connecting" }));
  let ws: WebSocket;
  try {
    ws = new WebSocket(`ws://127.0.0.1:${port}/bridge`);
  } catch {
    useWebMcpBridge.setState({ status: "waiting" });
    scheduleRetry();
    return;
  }
  socket = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", token: code, client: "openreel-web" }));
  ws.onmessage = (event) => {
    let msg: { type?: string } & McpBridgeRequest;
    try {
      msg = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (msg.type === "welcome") {
      retryDelay = 2000;
      useWebMcpBridge.setState({ status: "paired" });
      void fetchHubInfo(port);
      return;
    }
    if (msg.type === "request") {
      void loadHandler()
        .then((h) => h(msg))
        .then((res) => {
          ws.send(JSON.stringify({ type: "response", callId: msg.callId, ...res }));
          if (msg.kind === "callTool") useWebMcpBridge.setState((s) => ({ callsServed: s.callsServed + 1 }));
        })
        .catch((error: unknown) =>
          ws.send(JSON.stringify({ type: "response", callId: msg.callId, ok: false, error: error instanceof Error ? error.message : String(error) })),
        );
    }
  };
  ws.onclose = (event) => {
    if (socket !== ws) return;
    socket = null;
    if (event.code === 4401) {
      useWebMcpBridge.setState({ status: "bad-code" });
      return;
    }
    if (!useWebMcpBridge.getState().code) return;
    useWebMcpBridge.setState({ status: "waiting" });
    scheduleRetry();
  };
}

/** The tab the person looks at last gets the tool calls. */
function announceActive(): void {
  if (document.visibilityState === "visible" && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "active" }));
  }
}

export function pairWebMcp(code: string, port = useWebMcpBridge.getState().port): void {
  const clean = code.trim();
  if (!clean) return;
  writeStorage(CODE_KEY, clean);
  writeStorage(PORT_KEY, port === DEFAULT_HUB_PORT ? null : String(port));
  retryDelay = 2000;
  useWebMcpBridge.setState({ code: clean, port, status: "connecting" });
  connect();
}

export function unpairWebMcp(): void {
  writeStorage(CODE_KEY, null);
  clearRetry();
  const ws = socket;
  socket = null;
  ws?.close();
  useWebMcpBridge.setState({ code: null, status: "unpaired", callsServed: 0 });
}

/** Starts the bridge in a browser build. Idempotent; no-op in the desktop app (it uses IPC). */
export function installWebMcpBridge(): () => void {
  if (installed || typeof window === "undefined" || window.openreel?.platform === "desktop") return () => {};
  installed = true;
  document.addEventListener("visibilitychange", announceActive);
  window.addEventListener("focus", announceActive);
  connect();
  return () => {
    installed = false;
    document.removeEventListener("visibilitychange", announceActive);
    window.removeEventListener("focus", announceActive);
    clearRetry();
    socket?.close();
    socket = null;
  };
}
