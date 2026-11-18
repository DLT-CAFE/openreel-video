// DLT Cafe: the web bridge hub. A browser tab can't host an MCP server, so this
// small loopback process sits between Claude and the tab:
//   stdio shim --HTTP POST /mcp (bearer shimToken)--> hub --WebSocket /bridge--> tab
// The tab answers with the same McpBridgeRequest/Response contract the desktop
// app uses over IPC, through the same tool registry (@openreel/agent).
//
// Security, same as desktop: loopback only; the HTTP side needs the shim token
// and refuses browser requests (any Origin header); the WebSocket checks Host
// (against DNS rebinding) and Origin (allowlist), and a tab must send the
// pairing code within 5 s or it is dropped. Destructive/expensive tools are
// still gated inside the tab by "Trusted local".
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { handleMcpMessage, type JsonRpcMessage, type McpToolDef, type McpToolProvider, type McpToolResult } from "./core";
import { createDispatcher } from "./dispatcher";
import {
  BRIDGE_VERSION,
  DEFAULT_ALLOWED_ORIGINS,
  HUB_MCP_PATH,
  HUB_WS_PATH,
  LONG_RUNNING_TIMEOUT_MS,
  LONG_RUNNING_TOOLS,
  STANDARD_CALL_TIMEOUT_MS,
  type HubMessage,
  type TabMessage,
} from "./protocol";
import type { HubState } from "./state";
import { toolsCacheFile } from "./paths";
import { buildStylesIndex, contentType, readStylesRoot, resolveStyleFile, writeStylesRoot } from "./styles";

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const HELLO_TIMEOUT_MS = 5_000;
const WAIT_FOR_TAB_MS = 10_000;

export interface HubOptions {
  readonly state: HubState;
  readonly host?: string;
  readonly toolsCache?: string;
  readonly log?: (line: string) => void;
  /** How long a tool call waits for a tab to pair before failing. */
  readonly waitForTabMs?: number;
  /** Path of the openreel-mcp binary, shown in the web Settings so the config snippet is exact. */
  readonly cliPath?: string;
}

export interface RunningHub {
  readonly server: Server;
  readonly port: number;
  readonly tabCount: () => number;
  close(): Promise<void>;
}

export function tokenMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided || expected.length === 0) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Host header must name the loopback interface (guards against DNS rebinding). */
export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return name === "127.0.0.1" || name === "localhost" || name === "::1";
}

export function allowedOrigins(state: HubState): Set<string> {
  const extra = (process.env.OPENREEL_MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...(state.allowedOrigins ?? []), ...extra]);
}

function sendJson(res: ServerResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body), ...headers });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  const m = typeof h === "string" ? /^Bearer\s+(.+)$/i.exec(h.trim()) : null;
  return m ? m[1] : null;
}

export function readToolsCache(file = toolsCacheFile()): McpToolDef[] {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { tools?: McpToolDef[] };
    return Array.isArray(parsed.tools) ? parsed.tools : [];
  } catch {
    return [];
  }
}

export function writeToolsCache(tools: unknown, file = toolsCacheFile()): void {
  if (!Array.isArray(tools) || tools.length === 0) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify({ savedAt: new Date().toISOString(), tools }));
  } catch {
    // cache is best-effort
  }
}

export function startHub(options: HubOptions): Promise<RunningHub> {
  const { state } = options;
  const host = options.host ?? "127.0.0.1";
  const cacheFile = options.toolsCache ?? toolsCacheFile();
  const log = options.log ?? (() => {});
  const origins = allowedOrigins(state);

  // Paired tabs, most recently active last.
  const tabs: WebSocket[] = [];
  const activeTab = (): WebSocket | undefined => tabs[tabs.length - 1];
  const tabWaiters = new Set<() => void>();
  const markActive = (ws: WebSocket): void => {
    const i = tabs.indexOf(ws);
    if (i >= 0) tabs.splice(i, 1);
    tabs.push(ws);
    for (const wake of tabWaiters) wake();
    tabWaiters.clear();
  };

  const dispatcher = createDispatcher({
    send: (request) => {
      const ws = activeTab();
      if (!ws) throw new Error("No OpenReel browser tab is paired");
      const msg: HubMessage = { type: "request", ...request };
      ws.send(JSON.stringify(msg));
    },
  });

  const waitForTab = (ms: number): Promise<boolean> =>
    activeTab()
      ? Promise.resolve(true)
      : new Promise((resolve) => {
          const wake = () => {
            clearTimeout(timer);
            resolve(true);
          };
          const timer = setTimeout(() => {
            tabWaiters.delete(wake);
            resolve(false);
          }, ms);
          tabWaiters.add(wake);
        });

  const provider: McpToolProvider = {
    async listTools() {
      if (!activeTab()) return readToolsCache(cacheFile);
      const tools = (await dispatcher.request("listTools", {}, 10_000)) as McpToolDef[];
      writeToolsCache(tools, cacheFile);
      return tools ?? [];
    },
    async callTool(name, args): Promise<McpToolResult> {
      if (!(await waitForTab(options.waitForTabMs ?? WAIT_FOR_TAB_MS))) {
        return {
          ok: false,
          summary: "OpenReel is not open",
          error: {
            code: "NO_EDITOR",
            message:
              "Open the OpenReel desktop app, or open OpenReel in the browser and pair it in Settings > MCP.",
          },
        };
      }
      const timeout = LONG_RUNNING_TOOLS.has(name) ? LONG_RUNNING_TIMEOUT_MS : STANDARD_CALL_TIMEOUT_MS;
      return (await dispatcher.request("callTool", { name, args }, timeout)) as McpToolResult;
    },
  };
  const serverInfo = { name: "openreel", version: `${BRIDGE_VERSION}-web` };

  const serveStyles = async (req: IncomingMessage, res: ServerResponse, key: string, rel: string, origin: string | undefined): Promise<void> => {
    const headers: Record<string, string> = {
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "no-store",
      ...(origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, { ...headers, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type" }).end();
      return;
    }
    if (!tokenMatches(key, state.pairToken)) {
      sendJson(res, 401, { error: "Pair this tab first (Settings > MCP)" }, headers);
      return;
    }
    if (rel === "index.json" && req.method === "GET") {
      sendJson(res, 200, buildStylesIndex(), headers);
      return;
    }
    if (rel === "config" && req.method === "POST") {
      // Only a paired page from an allowed origin may change the folder.
      if (!origin || !origins.has(origin)) {
        sendJson(res, 403, { error: "Forbidden origin" }, headers);
        return;
      }
      try {
        const body = JSON.parse(await readBody(req)) as { root?: string };
        const err = writeStylesRoot(String(body.root ?? ""));
        sendJson(res, err ? 400 : 200, err ? { error: err } : { ok: true, root: readStylesRoot() }, headers);
      } catch {
        sendJson(res, 400, { error: "Bad request" }, headers);
      }
      return;
    }
    const file = req.method === "GET" ? resolveStyleFile(rel) : null;
    if (!file) {
      sendJson(res, 404, { error: "Not found" }, headers);
      return;
    }
    const size = statSync(file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.writeHead(416, { ...headers, "Content-Range": `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, "Content-Type": contentType(file), "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Type": contentType(file), "Accept-Ranges": "bytes", "Content-Length": String(size) });
    createReadStream(file).pipe(res);
  };

  const server = createServer((req, res) => {
    void (async () => {
      if (!isLoopbackHost(req.headers.host)) {
        sendJson(res, 403, { error: "Forbidden host" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;

      if (url.pathname === "/health") {
        // Lets the web app see that the bridge is running. No secrets here.
        const cors: Record<string, string> = origin && origins.has(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
        sendJson(res, 200, { ok: true, name: "openreel-mcp-hub", version: BRIDGE_VERSION, tabs: tabs.length, cliPath: options.cliPath }, cors);
        return;
      }
      // DLT Cafe: creator styles for a paired browser tab: /styles/k/<pairing code>/<index.json|media/…|skills/…>.
      // The code sits in the path so relative URLs inside a live HTML sample keep it.
      const sm = /^\/styles\/k\/([^/]+)\/(.*)$/.exec(url.pathname);
      if (sm) {
        await serveStyles(req, res, decodeURIComponent(sm[1]), sm[2], origin);
        return;
      }
      if (url.pathname !== HUB_MCP_PATH || req.method !== "POST") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      // The MCP endpoint is for the local stdio shim only, never for web pages.
      if (origin) {
        sendJson(res, 403, { error: "Browser requests are not allowed" });
        return;
      }
      if (!tokenMatches(bearer(req), state.shimToken)) {
        sendJson(res, 401, { error: "Unauthorized" });
        return;
      }
      try {
        const body = await readBody(req);
        const parsed = JSON.parse(body) as JsonRpcMessage;
        const response = await handleMcpMessage(parsed, provider, serverInfo);
        if (!response) {
          res.writeHead(202).end();
          return;
        }
        sendJson(res, 200, response);
      } catch (error) {
        sendJson(res, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: error instanceof SyntaxError ? -32700 : -32600, message: error instanceof Error ? error.message : "Bad request" },
        });
      }
    })();
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const origin = req.headers.origin;
    if (url.pathname !== HUB_WS_PATH || !isLoopbackHost(req.headers.host) || typeof origin !== "string" || !origins.has(origin)) {
      log(`refused upgrade path=${url.pathname} origin=${String(origin)} host=${String(req.headers.host)}`);
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      let paired = false;
      const helloTimer = setTimeout(() => {
        if (!paired) ws.close(4401, "Pairing code required");
      }, HELLO_TIMEOUT_MS);

      ws.on("message", (raw) => {
        let msg: TabMessage;
        try {
          msg = JSON.parse(String(raw)) as TabMessage;
        } catch {
          return;
        }
        if (!paired) {
          if (msg.type === "hello" && tokenMatches(msg.token, state.pairToken)) {
            paired = true;
            clearTimeout(helloTimer);
            const welcome: HubMessage = { type: "welcome", hubVersion: BRIDGE_VERSION };
            ws.send(JSON.stringify(welcome));
            markActive(ws);
            log(`tab paired from ${origin} (${tabs.length} open)`);
          } else {
            ws.close(4401, "Wrong pairing code");
          }
          return;
        }
        if (msg.type === "active") markActive(ws);
        else if (msg.type === "response") dispatcher.handleResponse(msg);
      });
      ws.on("close", () => {
        clearTimeout(helloTimer);
        const i = tabs.indexOf(ws);
        if (i >= 0) tabs.splice(i, 1);
        if (paired) log(`tab closed (${tabs.length} open)`);
        if (tabs.length === 0) dispatcher.rejectAll("The OpenReel tab was closed");
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(state.port, host, () => {
      server.removeListener("error", reject);
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : state.port;
      resolve({
        server,
        port,
        tabCount: () => tabs.length,
        close: () =>
          new Promise<void>((done) => {
            for (const ws of wss.clients) ws.terminate();
            dispatcher.rejectAll("Hub shutting down");
            server.close(() => done());
          }),
      });
    });
  });
}
