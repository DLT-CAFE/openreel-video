import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { startHub, isLoopbackHost, type RunningHub } from "./hub";
import { postJson } from "./shim";
import type { HubState } from "./state";

const ORIGIN = "http://localhost:5174";
let hub: RunningHub;
let state: HubState;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), "orhub-"));
  state = { port: 0, shimToken: "s".repeat(64), pairToken: "abcd-ef01-2345-6789" };
  hub = await startHub({ state, toolsCache: path.join(dir, "tools.json"), waitForTabMs: 200 });
});
afterEach(async () => {
  await hub.close();
});

const mcp = (message: unknown, token = state.shimToken) =>
  postJson({ host: "127.0.0.1", port: hub.port, path: "/mcp", token }, message);

function openTab(origin = ORIGIN): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${hub.port}/bridge`, { origin });
    ws.once("open", () => resolve(ws));
    ws.once("error", reject);
  });
}

function pairedTab(onRequest: (req: { callId: string; kind: string; name?: string }) => unknown): Promise<WebSocket> {
  return openTab().then(
    (ws) =>
      new Promise((resolve) => {
        ws.on("message", (raw) => {
          const msg = JSON.parse(String(raw));
          if (msg.type === "welcome") resolve(ws);
          if (msg.type === "request") ws.send(JSON.stringify({ type: "response", callId: msg.callId, ok: true, result: onRequest(msg) }));
        });
        ws.send(JSON.stringify({ type: "hello", token: state.pairToken }));
      }),
  );
}

describe("hub security", () => {
  it("only accepts loopback Host headers", () => {
    expect(isLoopbackHost("127.0.0.1:47615")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("evil.example:47615")).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);
  });

  it("rejects MCP calls without the shim token", async () => {
    await expect(mcp({ jsonrpc: "2.0", id: 1, method: "ping" }, "wrong")).rejects.toThrow(/401/);
  });

  it("refuses WebSockets from origins not on the allowlist", async () => {
    await expect(openTab("https://evil.example")).rejects.toThrow(/403/);
  });

  it("drops a tab that sends the wrong pairing code", async () => {
    const ws = await openTab();
    const code = await new Promise<number>((resolve) => {
      ws.on("close", (c) => resolve(c));
      ws.send(JSON.stringify({ type: "hello", token: "nope" }));
    });
    expect(code).toBe(4401);
    expect(hub.tabCount()).toBe(0);
  });
});

describe("hub routing", () => {
  it("says the editor is not open when no tab is paired", async () => {
    const res = (await mcp({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_tracks", arguments: {} } })) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toMatch(/NO_EDITOR/);
  });

  it("serves tools through the paired tab and caches the list", async () => {
    const ws = await pairedTab((req) =>
      req.kind === "listTools"
        ? [{ name: "list_tracks", description: "d", inputSchema: {} }]
        : { ok: true, summary: `ran ${req.name}`, data: { n: 1 } },
    );
    const list = (await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" })) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toEqual(["list_tracks"]);
    const call = (await mcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "list_tracks", arguments: {} } })) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(call.result.isError).toBe(false);
    expect(call.result.content[0].text).toMatch(/ran list_tracks/);
    ws.close();
    await new Promise((r) => setTimeout(r, 50));
    // with the tab gone, the cached list still answers tools/list
    const cached = (await mcp({ jsonrpc: "2.0", id: 3, method: "tools/list" })) as { result: { tools: unknown[] } };
    expect(cached.result.tools).toHaveLength(1);
  });
});
