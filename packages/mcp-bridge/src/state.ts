import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DEFAULT_HUB_PORT } from "./protocol";
import { hubStateFile } from "./paths";

export interface HubState {
  /** Loopback port the hub listens on. The web app connects to it. */
  port: number;
  /** Bearer token for the stdio shim → hub HTTP calls. Never leaves this machine. */
  shimToken: string;
  /** Pairing code a browser tab must present before it can serve tool calls. */
  pairToken: string;
  /** Extra browser origins allowed to pair (e.g. a hosted build later). */
  allowedOrigins?: string[];
  pid?: number;
}

function token(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** A short code that is easy to paste: 4 groups of 4 hex chars (64 bits). */
export function newPairToken(): string {
  return token(8).match(/.{4}/g)!.join("-");
}

export function readHubState(file = hubStateFile()): HubState | null {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<HubState>;
    if (!parsed.shimToken || !parsed.pairToken || !parsed.port) return null;
    return parsed as HubState;
  } catch {
    return null;
  }
}

export function writeHubState(state: HubState, file = hubStateFile()): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2), { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    // best-effort
  }
}

/** Reads the state, creating tokens on first run. Tokens persist so pairing survives restarts. */
export function loadOrCreateHubState(file = hubStateFile()): HubState {
  const existing = existsSync(file) ? readHubState(file) : null;
  if (existing) return existing;
  const envPort = Number(process.env.OPENREEL_MCP_HUB_PORT);
  const state: HubState = {
    port: Number.isInteger(envPort) && envPort > 0 ? envPort : DEFAULT_HUB_PORT,
    shimToken: token(32),
    pairToken: newPairToken(),
  };
  writeHubState(state, file);
  return state;
}
