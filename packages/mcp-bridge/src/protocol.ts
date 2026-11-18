// Same contract as apps/desktop/src/shared/mcp.ts (McpBridgeRequest/Response) and
// apps/web/src/services/agent/mcp-listener.ts. Keep the three in sync.
export interface McpBridgeRequest {
  callId: string;
  kind: "listTools" | "callTool";
  name?: string;
  args?: Record<string, unknown>;
}

export interface McpBridgeResponse {
  callId: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** Messages a browser tab sends to the hub over the WebSocket. */
export type TabMessage =
  | { type: "hello"; token: string; client?: string }
  | { type: "active" }
  | ({ type: "response" } & McpBridgeResponse);

/** Messages the hub sends to a browser tab. */
export type HubMessage =
  | { type: "welcome"; hubVersion: string }
  | ({ type: "request" } & McpBridgeRequest);

export const HUB_WS_PATH = "/bridge";
export const HUB_MCP_PATH = "/mcp";
export const DEFAULT_HUB_PORT = 47615;
export const BRIDGE_VERSION = "0.1.0";

/** Tools that render or import a lot get a long timeout, as on desktop. */
export const LONG_RUNNING_TOOLS = new Set<string>([
  "export_video",
  "export_audio",
  "render_motion_frame",
  "render_creation_preview",
  "sync_motion_to_audio",
  "import_portable_edit",
  "start_style_job",
]);
export const LONG_RUNNING_TIMEOUT_MS = 30 * 60_000;
export const STANDARD_CALL_TIMEOUT_MS = 120_000;

/** Browser origins allowed to pair by default (local dev + preview of the web app). */
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
