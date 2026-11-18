import { defineConfig } from "tsup";

// One self-contained file (ws bundled in) so the binary runs under plain node
// from anywhere, including from inside the packaged desktop app.
export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node18",
  noExternal: ["ws"],
  clean: true,
});
