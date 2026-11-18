#!/usr/bin/env node
// openreel-mcp: DLT Cafe's local MCP bridge for OpenReel (web + desktop).
//   openreel-mcp          stdio MCP server (what Claude Desktop / Claude Code run)
//   openreel-mcp hub      run the web bridge hub in the foreground
//   openreel-mcp pair     start the hub if needed and print the browser pairing code
//   openreel-mcp status   show what is reachable
import { appendFileSync } from "node:fs";
import { startHub } from "./hub";
import { hubLogFile } from "./paths";
import { BRIDGE_VERSION } from "./protocol";
import { ensureHub, hubHealthy, readDesktopEndpoint, runShim, postJson } from "./shim";
import { loadOrCreateHubState, writeHubState } from "./state";

const cliPath = process.argv[1];
const command = process.argv[2] ?? "stdio";

async function main(): Promise<void> {
  switch (command) {
    case "stdio":
      runShim(cliPath);
      return;
    case "hub": {
      const state = loadOrCreateHubState();
      const log = (line: string) => {
        const text = `${new Date().toISOString()} ${line}\n`;
        process.stdout.write(text);
        if (!process.stdout.isTTY) return;
        try {
          appendFileSync(hubLogFile(), text);
        } catch {
          // ignore
        }
      };
      const hub = await startHub({ state, log, cliPath });
      writeHubState({ ...state, pid: process.pid });
      log(`openreel-mcp hub ${BRIDGE_VERSION} on 127.0.0.1:${hub.port}`);
      const stop = () => void hub.close().then(() => process.exit(0));
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
      return;
    }
    case "pair": {
      const state = await ensureHub(cliPath);
      process.stdout.write(
        `OpenReel web bridge is running on 127.0.0.1:${state.port}.\n` +
          `Pairing code: ${state.pairToken}\n` +
          "Paste it in OpenReel (browser) > Settings > MCP > Pair this tab.\n",
      );
      return;
    }
    case "status": {
      const desktop = readDesktopEndpoint();
      let desktopUp = false;
      if (desktop) {
        try {
          await postJson(desktop, { jsonrpc: "2.0", id: 1, method: "ping" }, 1500);
          desktopUp = true;
        } catch {
          desktopUp = false;
        }
      }
      const state = loadOrCreateHubState();
      process.stdout.write(
        JSON.stringify({ version: BRIDGE_VERSION, desktop: desktopUp, hub: await hubHealthy(state.port), hubPort: state.port }, null, 2) + "\n",
      );
      return;
    }
    default:
      process.stderr.write(`openreel-mcp: unknown command '${command}'. Use: (none) | hub | pair | status\n`);
      process.exit(2);
  }
}

void main().catch((error) => {
  process.stderr.write(`openreel-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
