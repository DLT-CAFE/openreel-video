import os from "node:os";
import path from "node:path";

export function openreelDir(): string {
  return path.join(os.homedir(), ".openreel");
}

/** Written by the desktop app on launch (same rule as apps/desktop/src/shared/mcp.ts). */
export function desktopEndpointFile(): string {
  const override = process.env.OPENREEL_MCP_ENDPOINT_FILE;
  return override && override.length > 0 ? override : path.join(openreelDir(), "mcp-endpoint.json");
}

/** The hub's port and tokens (0600). */
export function hubStateFile(): string {
  const override = process.env.OPENREEL_MCP_HUB_FILE;
  return override && override.length > 0 ? override : path.join(openreelDir(), "mcp-web-bridge.json");
}

/** Last tool list seen, so Claude still sees the tools while no editor is open. */
export function toolsCacheFile(): string {
  return path.join(path.dirname(hubStateFile()), "mcp-tools-cache.json");
}

export function hubLogFile(): string {
  return path.join(path.dirname(hubStateFile()), "mcp-hub.log");
}
