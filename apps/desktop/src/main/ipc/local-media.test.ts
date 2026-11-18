import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LocalMediaReader,
  checkLocalMediaPath,
  configuredRoots,
  expandHome,
  isInsideRoot,
} from "./local-media";

let base: string;
let root: string;
let outside: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "openreel-local-media-")));
  root = path.join(base, "approved");
  outside = path.join(base, "outside");
  mkdirSync(path.join(root, "sub"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(path.join(root, "sub", "clip.mp4"), Buffer.alloc(1000, 7));
  writeFileSync(path.join(root, "UPPER.MOV"), Buffer.alloc(10, 1));
  writeFileSync(path.join(root, "notes.txt"), "hello");
  writeFileSync(path.join(outside, "secret.mp4"), Buffer.alloc(10, 2));
  // Symlink inside the root that points outside it.
  symlinkSync(path.join(outside, "secret.mp4"), path.join(root, "escape.mp4"));
  // Symlinked directory inside the root that points outside it.
  symlinkSync(outside, path.join(root, "linked-dir"));
  // Symlink with a media name pointing at a non-media file inside the root.
  symlinkSync(path.join(root, "notes.txt"), path.join(root, "disguised.mp4"));
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const opts = () => ({ roots: [root], home: base });

describe("path helpers", () => {
  it("expands ~", () => {
    expect(expandHome("~/a/b", "/h")).toBe("/h/a/b");
    expect(expandHome("~", "/h")).toBe("/h");
    expect(expandHome("/abs", "/h")).toBe("/abs");
  });

  it("defaults to ~/DLT-Cafe and honours OPENREEL_MEDIA_ROOTS", () => {
    expect(configuredRoots({}, "/h")).toEqual(["/h/DLT-Cafe"]);
    expect(configuredRoots({ OPENREEL_MEDIA_ROOTS: "~/A: /b/c :" }, "/h")).toEqual(["/h/A", "/b/c"]);
  });

  it("isInsideRoot uses path.relative semantics", () => {
    expect(isInsideRoot("/r/a.mp4", "/r")).toBe(true);
    expect(isInsideRoot("/r/x/y.mp4", "/r")).toBe(true);
    expect(isInsideRoot("/r", "/r")).toBe(false);
    expect(isInsideRoot("/r2/a.mp4", "/r")).toBe(false);
    expect(isInsideRoot("/a.mp4", "/r")).toBe(false);
    expect(isInsideRoot("/r/..foo.mp4", "/r")).toBe(true);
  });
});

describe("checkLocalMediaPath", () => {
  it("accepts a media file inside a root", async () => {
    const res = await checkLocalMediaPath({ path: path.join(root, "sub", "clip.mp4") }, opts());
    expect(res).toMatchObject({ ok: true, size: 1000, ext: "mp4" });
  });

  it("accepts ~ paths and upper-case extensions", async () => {
    const res = await checkLocalMediaPath({ path: "~/approved/UPPER.MOV" }, opts());
    expect(res).toMatchObject({ ok: true, ext: "mov" });
  });

  it("rejects a file outside the roots", async () => {
    const res = await checkLocalMediaPath({ path: path.join(outside, "secret.mp4") }, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outside the approved/);
  });

  it("rejects .. traversal out of a root", async () => {
    const res = await checkLocalMediaPath(
      { path: path.join(root, "..", "outside", "secret.mp4") },
      opts(),
    );
    expect(res.ok).toBe(false);
  });

  it("rejects a symlinked file that escapes the root", async () => {
    const res = await checkLocalMediaPath({ path: path.join(root, "escape.mp4") }, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outside the approved/);
  });

  it("rejects a file reached through a symlinked directory that escapes the root", async () => {
    const res = await checkLocalMediaPath({ path: path.join(root, "linked-dir", "secret.mp4") }, opts());
    expect(res.ok).toBe(false);
  });

  it("rejects a bad extension", async () => {
    const res = await checkLocalMediaPath({ path: path.join(root, "notes.txt") }, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/Not an allowed media type/);
  });

  it("checks the extension of the resolved file, not the link name", async () => {
    const res = await checkLocalMediaPath({ path: path.join(root, "disguised.mp4") }, opts());
    expect(res.ok).toBe(false);
  });

  it("rejects a file over the size cap", async () => {
    const res = await checkLocalMediaPath(
      { path: path.join(root, "sub", "clip.mp4"), maxBytes: 999 },
      opts(),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too large/);
  });

  it("reports a missing file outside the roots as outside, not as missing", async () => {
    const res = await checkLocalMediaPath({ path: path.join(outside, "nope.mp4") }, opts());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outside the approved/);
  });

  it("rejects relative paths, missing files and directories", async () => {
    expect((await checkLocalMediaPath({ path: "approved/sub/clip.mp4" }, opts())).ok).toBe(false);
    expect((await checkLocalMediaPath({ path: path.join(root, "nope.mp4") }, opts())).ok).toBe(false);
    expect((await checkLocalMediaPath({ path: path.join(root, "sub") }, opts())).ok).toBe(false);
  });

  it("rejects everything when no root exists", async () => {
    const res = await checkLocalMediaPath(
      { path: path.join(root, "sub", "clip.mp4") },
      { roots: [path.join(base, "missing-root")], home: base },
    );
    expect(res.ok).toBe(false);
  });
});

describe("LocalMediaReader", () => {
  it("opens, reads in chunks and closes", async () => {
    const reader = new LocalMediaReader(opts());
    const opened = await reader.open({ path: path.join(root, "sub", "clip.mp4") });
    expect(opened).toMatchObject({ ok: true, name: "clip.mp4", size: 1000, contentType: "video/mp4" });
    const a = await reader.read({ handle: opened.handle, offset: 0, length: 600 });
    const b = await reader.read({ handle: opened.handle, offset: 600, length: 600 });
    expect(a.byteLength).toBe(600);
    expect(b.byteLength).toBe(400);
    expect(new Uint8Array(b)[0]).toBe(7);
    await reader.close({ handle: opened.handle });
    await expect(reader.read({ handle: opened.handle, offset: 0, length: 1 })).rejects.toThrow();
  });

  it("returns an error result (no handle) for a refused path", async () => {
    const reader = new LocalMediaReader(opts());
    const opened = await reader.open({ path: path.join(outside, "secret.mp4") });
    expect(opened.ok).toBe(false);
    expect(opened.handle).toBe("");
  });
});
