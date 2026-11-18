// DLT Cafe: the stdio side Claude Desktop / Claude Code start. One binary for
// both editors: each tool call goes to the desktop app if it is running
// (~/.openreel/mcp-endpoint.json), otherwise to the web bridge hub, which hands
// it to the paired browser tab. The hub is started on demand.
import { spawn } from "node:child_process";
import { openSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createInterface } from "node:readline";
import { handleMcpMessage, type JsonRpcMessage, type McpToolProvider, type McpToolResult } from "./core";
import { readToolsCache, writeToolsCache } from "./hub";
import { desktopEndpointFile, hubLogFile } from "./paths";
import { BRIDGE_VERSION, HUB_MCP_PATH } from "./protocol";
import { loadOrCreateHubState, type HubState } from "./state";

interface Endpoint {
  host: string;
  port: number;
  path: string;
  token: string;
}

type Post = (endpoint: Endpoint, message: unknown, timeoutMs?: number) => Promise<unknown>;

export function postJson(endpoint: Endpoint, message: unknown, timeoutMs = 0): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(message);
    const req = httpRequest(
      {
        host: endpoint.host,
        port: endpoint.port,
        path: endpoint.path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${endpoint.token}`,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode === 202 || !text) return resolve(null);
          if (res.statusCode && res.statusCode >= 400) return reject(new Error(`HTTP ${res.statusCode}: ${text}`));
          try {
            resolve(JSON.parse(text));
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      },
    );
    if (timeoutMs > 0) req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

export function readDesktopEndpoint(file = desktopEndpointFile()): Endpoint | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { url?: string; token?: string };
    if (!parsed.url || !parsed.token) return null;
    const url = new URL(parsed.url);
    return { host: url.hostname, port: Number(url.port), path: url.pathname, token: parsed.token };
  } catch {
    return null;
  }
}

function hubEndpoint(state: HubState): Endpoint {
  return { host: "127.0.0.1", port: state.port, path: HUB_MCP_PATH, token: state.shimToken };
}

export function hubHealthy(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/health", method: "GET", timeout: 1000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        try {
          resolve((JSON.parse(Buffer.concat(chunks).toString("utf8")) as { name?: string }).name === "openreel-mcp-hub");
        } catch {
          resolve(false);
        }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

/** Starts the hub as a detached background process if it isn't running. */
export async function ensureHub(cliPath: string): Promise<HubState> {
  const state = loadOrCreateHubState();
  if (await hubHealthy(state.port)) return state;
  const out = openSync(hubLogFile(), "a");
  const child = spawn(process.execPath, [cliPath, "hub"], { detached: true, stdio: ["ignore", out, out] });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await hubHealthy(state.port)) return state;
  }
  throw new Error(`The OpenReel web bridge did not start (see ${hubLogFile()})`);
}

function isUnreachable(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EHOSTUNREACH";
}

export interface RouterDeps {
  readonly desktop: () => Endpoint | null;
  readonly hub: () => Promise<Endpoint>;
  readonly post: Post;
}

/**
 * Routes tools/list and tools/call: desktop first, then the web hub. Answers the
 * MCP handshake itself so Claude can connect while no editor is open.
 */
export function createRouter(deps: RouterDeps): McpToolProvider & { forward(message: JsonRpcMessage): Promise<unknown> } {
  const forward = async (message: JsonRpcMessage): Promise<unknown> => {
    const desktop = deps.desktop();
    if (desktop) {
      try {
        return await deps.post(desktop, message);
      } catch (error) {
        if (!isUnreachable(error)) throw error;
        // stale endpoint file: the desktop app isn't running, fall through to web
      }
    }
    return deps.post(await deps.hub(), message);
  };

  return {
    forward,
    async listTools() {
      try {
        const res = (await forward({ jsonrpc: "2.0", id: "list", method: "tools/list" })) as { result?: { tools?: unknown[] } } | null;
        const tools = res?.result?.tools;
        if (Array.isArray(tools) && tools.length > 0) {
          writeToolsCache(tools);
          return tools as never;
        }
      } catch {
        // fall back to the cache below
      }
      return readToolsCache();
    },
    async callTool(name, args): Promise<McpToolResult> {
      // Not used: tools/call is forwarded raw (see handleLine) to keep images etc. intact.
      void name;
      void args;
      throw new Error("unreachable");
    },
  };
}

const serverInfo = { name: "openreel", version: BRIDGE_VERSION };

export async function handleLine(line: string, router: ReturnType<typeof createRouter>): Promise<string | null> {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let message: JsonRpcMessage;
  try {
    message = JSON.parse(trimmed) as JsonRpcMessage;
  } catch {
    return null;
  }
  const isNotification = message.id === undefined || message.id === null;
  try {
    if (message.method === "tools/call") {
      const res = await router.forward(message);
      return res === null || res === undefined ? null : JSON.stringify(res);
    }
    const res = await handleMcpMessage(message, router, serverInfo);
    return res ? JSON.stringify(res) : null;
  } catch (error) {
    if (isNotification) return null;
    return JSON.stringify({
      jsonrpc: "2.0",
      id: message.id ?? null,
      result: {
        content: [
          {
            type: "text",
            text: `OpenReel is not reachable: ${error instanceof Error ? error.message : String(error)}. Open the OpenReel desktop app, or open OpenReel in the browser and pair it in Settings > MCP.`,
          },
        ],
        isError: true,
      },
    });
  }
}

export function runShim(cliPath: string): void {
  const router = createRouter({
    desktop: () => readDesktopEndpoint(),
    hub: async () => hubEndpoint(await ensureHub(cliPath)),
    post: postJson,
  });
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    void handleLine(line, router).then((out) => {
      if (out !== null) process.stdout.write(`${out}\n`);
    });
  });
  rl.on("close", () => process.exit(0));
}
