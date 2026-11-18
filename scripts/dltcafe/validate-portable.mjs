#!/usr/bin/env node
// Runs validate-portable.ts through vite-node (already installed via vitest),
// so the core TypeScript sources load without a build step.
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const core = path.resolve(here, "../../packages/core/package.json");
const vitest = createRequire(core).resolve("vitest/package.json");
const viteNodePkg = createRequire(vitest).resolve("vite-node/package.json");
const cli = path.join(path.dirname(viteNodePkg), "vite-node.mjs");
const files = process.argv.slice(2).map((f) => path.resolve(f));
const r = spawnSync(process.execPath, [cli, path.join(here, "validate-portable.ts"), ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
