import { describe, it, expect } from "vitest";
import {
  isMediaFileName, isSkippedSegment, scanDirectoryHandle, scanInputFiles, summarizeScan,
} from "./folder-import";

const file = (rel: string, size = 3) => {
  const name = rel.split("/").pop()!;
  const f = new File([new Uint8Array(size)], name);
  Object.defineProperty(f, "webkitRelativePath", { value: rel });
  return f;
};

type FakeNode = { [name: string]: FakeNode | number };
function dirHandle(name: string, tree: FakeNode): FileSystemDirectoryHandle {
  return {
    kind: "directory",
    name,
    async *values() {
      for (const [n, v] of Object.entries(tree)) {
        if (typeof v === "number") {
          yield { kind: "file", name: n, getFile: async () => new File([new Uint8Array(v)], n) } as unknown as FileSystemHandle;
        } else {
          yield dirHandle(n, v) as unknown as FileSystemHandle;
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("folder import", () => {
  it("knows media names and skipped folders", () => {
    expect(isMediaFileName("Clip.MOV")).toBe(true);
    expect(isMediaFileName("vo.wav")).toBe(true);
    expect(isMediaFileName("notes.txt")).toBe(false);
    expect(isMediaFileName(".hidden.mp4")).toBe(false);
    expect(isMediaFileName("._clip.mp4")).toBe(false);
    expect(isSkippedSegment("Adobe Premiere Pro Video Previews")).toBe(true);
    expect(isSkippedSegment("__MACOSX")).toBe(true);
    expect(isSkippedSegment("day 1")).toBe(false);
  });

  it("scans <input webkitdirectory> files recursively, media only, in path order", () => {
    const scan = scanInputFiles([
      file("Shoot/b/clip10.mp4"),
      file("Shoot/b/clip2.mp4"),
      file("Shoot/a.wav"),
      file("Shoot/readme.txt"),
      file("Shoot/.DS_Store"),
      file("Shoot/Adobe Premiere Pro Video Previews/x.mp4"),
      file("Shoot/logo.PNG"),
    ]);
    expect(scan.folderName).toBe("Shoot");
    expect(scan.entries.map((e) => e.relativePath)).toEqual(["a.wav", "b/clip2.mp4", "b/clip10.mp4", "logo.PNG"]);
    expect(scan.skippedNonMedia).toBe(3);
  });

  it("walks a directory handle recursively and keeps file handles", async () => {
    const scan = await scanDirectoryHandle(dirHandle("Hero", {
      "open01.mp4": 5,
      "sub": { "deeper": { "vo.m4a": 2 }, "x.json": 1 },
      ".git": { "a.mp4": 1 },
      "Media Cache": { "c.mp4": 1 },
    }));
    expect(scan.folderName).toBe("Hero");
    expect(scan.entries.map((e) => e.relativePath)).toEqual(["open01.mp4", "sub/deeper/vo.m4a"]);
    expect(scan.entries.every((e) => e.handle)).toBe(true);
    expect(scan.skippedNonMedia).toBe(1);
  });

  it("caps the number of files and reports the rest", () => {
    const scan = scanInputFiles(Array.from({ length: 7 }, (_, i) => file(`F/c${i}.mp4`)), 5);
    expect(scan.entries).toHaveLength(5);
    expect(scan.skippedOverLimit).toBe(2);
    expect(summarizeScan(scan, 4, 1)).toBe("Imported 4 files from “F” · 1 failed · 2 over the 500-file limit skipped");
  });
});
