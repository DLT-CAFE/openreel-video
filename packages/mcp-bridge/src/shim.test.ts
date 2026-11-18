import { describe, expect, it, vi } from "vitest";
import { createRouter, handleLine } from "./shim";

const desktop = { host: "127.0.0.1", port: 1, path: "/mcp", token: "d" };
const hub = { host: "127.0.0.1", port: 2, path: "/mcp", token: "h" };
const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });

describe("shim routing", () => {
  it("answers initialize itself, with no editor running", async () => {
    const post = vi.fn();
    const router = createRouter({ desktop: () => null, hub: async () => hub, post });
    const out = JSON.parse((await handleLine('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}', router))!);
    expect(out.result.serverInfo.name).toBe("openreel");
    expect(post).not.toHaveBeenCalled();
  });

  it("prefers the desktop app", async () => {
    const post = vi.fn().mockResolvedValue({ jsonrpc: "2.0", id: 1, result: { content: [], isError: false } });
    const router = createRouter({ desktop: () => desktop, hub: async () => hub, post });
    await handleLine('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}}', router);
    expect(post.mock.calls[0][0]).toBe(desktop);
  });

  it("falls back to the web hub when the desktop app is not running", async () => {
    const post = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce({ jsonrpc: "2.0", id: 1, result: { ok: 1 } });
    const router = createRouter({ desktop: () => desktop, hub: async () => hub, post });
    const out = JSON.parse((await handleLine('{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"x"}}', router))!);
    expect(post.mock.calls[1][0]).toBe(hub);
    expect(out.result.ok).toBe(1);
  });

  it("returns a readable tool error when nothing is reachable", async () => {
    const router = createRouter({ desktop: () => null, hub: async () => { throw new Error("hub down"); }, post: vi.fn() });
    const out = JSON.parse((await handleLine('{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"x"}}', router))!);
    expect(out.id).toBe(7);
    expect(out.result.isError).toBe(true);
    expect(out.result.content[0].text).toMatch(/Settings > MCP/);
  });
});
