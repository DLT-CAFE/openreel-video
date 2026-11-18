// DLT Cafe: validate an openreel-edit JSON with the app's own validator.
// Run: node scripts/dltcafe/validate-portable.mjs <file.openreel.json> [...]
import { readFileSync } from "node:fs";
import { parsePortableEdit } from "../../packages/core/src/editing/portable-project";

let failed = 0;
for (const file of process.argv.slice(2)) {
  try {
    const doc = parsePortableEdit(readFileSync(file, "utf8"));
    const tracks = doc.project.timeline.tracks;
    const clips = tracks.reduce((n, t) => n + t.clips.length, 0);
    const end = Math.max(0, ...tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)));
    console.log(`OK ${file}: ${tracks.length} tracks, ${clips} clips, ${doc.project.media.length} media, ${end.toFixed(3)}s`);
  } catch (error) {
    failed++;
    console.error(`INVALID ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (process.argv.length < 3) {
  console.error("usage: validate-portable.mjs <file.openreel.json> [...]");
  failed = 1;
}
process.exit(failed ? 1 : 0);
