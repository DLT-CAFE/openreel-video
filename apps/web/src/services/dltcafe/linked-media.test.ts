import { describe, it, expect, vi, beforeEach } from "vitest";

const stored = new Map<string, unknown>();
const handles = new Map<string, FileSystemFileHandle>();
vi.mock("../media-storage", () => ({
  saveMediaBlob: vi.fn(async (_p: string, id: string, blob: Blob) => { stored.set(id, blob); }),
  loadFileHandle: vi.fn(async (name: string, size: number) => handles.get(`${name}:${size}`) ?? null),
  saveFileHandle: vi.fn(async (name: string, size: number, h: FileSystemFileHandle) => { handles.set(`${name}:${size}`, h); }),
}));

import {
  DEFAULT_LINK_THRESHOLD_BYTES, findLinkedNeedingAccess, linkThresholdBytes, persistMediaOrLink, regainAccess, shouldLink,
} from "./linked-media";
import type { MediaItem } from "@openreel/core";

function bigFile(name: string, size: number): File {
  const f = new File([], name);
  Object.defineProperty(f, "size", { value: size });
  return f;
}
function fakeHandle(file: File, permission: PermissionState, grant: PermissionState = "granted") {
  return {
    kind: "file", name: file.name,
    getFile: vi.fn(async () => file),
    queryPermission: vi.fn(async () => permission),
    requestPermission: vi.fn(async () => grant),
  } as unknown as FileSystemFileHandle;
}
const meta = { duration: 1, width: 1, height: 1, frameRate: 1, codec: "", sampleRate: 0, channels: 0, fileSize: 1 };

describe("linked media", () => {
  beforeEach(() => {
    stored.clear(); handles.clear(); localStorage.clear();
    (window as unknown as { FileSystemFileHandle: unknown }).FileSystemFileHandle = class {};
  });

  it("uses a 200 MB default threshold, overridable (0 = never link)", () => {
    expect(linkThresholdBytes()).toBe(DEFAULT_LINK_THRESHOLD_BYTES);
    localStorage.setItem("dltcafe-link-threshold-mb", "1");
    expect(linkThresholdBytes()).toBe(1024 * 1024);
    localStorage.setItem("dltcafe-link-threshold-mb", "0");
    expect(linkThresholdBytes()).toBe(Infinity);
  });

  it("links big files that have a handle, copies everything else", async () => {
    const big = bigFile("long.mov", 300 * 1024 * 1024);
    const bigNoHandle = bigFile("other.mov", 300 * 1024 * 1024);
    const small = bigFile("small.mp4", 10);
    handles.set(`long.mov:${big.size}`, fakeHandle(big, "granted"));
    handles.set(`small.mp4:10`, fakeHandle(small, "granted"));
    expect(await persistMediaOrLink("p", "a", big, meta)).toBe("linked");
    expect(await persistMediaOrLink("p", "b", bigNoHandle, meta)).toBe("copied");
    expect(await persistMediaOrLink("p", "c", small, meta)).toBe("copied");
    expect([...stored.keys()]).toEqual(["b", "c"]);
  });

  it("copies when the browser has no file handles (Firefox/Safari)", async () => {
    delete (window as unknown as { FileSystemFileHandle?: unknown }).FileSystemFileHandle;
    const big = bigFile("long.mov", 300 * 1024 * 1024);
    handles.set(`long.mov:${big.size}`, fakeHandle(big, "granted"));
    expect(await shouldLink(big)).toBe(false);
  });

  it("finds placeholders whose handle needs permission and relinks after the OK", async () => {
    const f1 = bigFile("a.mov", 500), f2 = bigFile("b.mov", 600), f3 = bigFile("c.mov", 700);
    handles.set("a.mov:500", fakeHandle(f1, "prompt"));
    handles.set("b.mov:600", fakeHandle(f2, "granted"));
    handles.set("c.mov:700", fakeHandle(f3, "prompt", "denied"));
    const item = (id: string, name: string, size: number, isPlaceholder = true) =>
      ({ id, name, isPlaceholder, sourceFile: { name, size, lastModified: 0 } }) as unknown as MediaItem;
    const needs = await findLinkedNeedingAccess([item("1", "a.mov", 500), item("2", "b.mov", 600), item("3", "c.mov", 700), item("4", "a.mov", 500, false)]);
    expect(needs.map((n) => n.item.id)).toEqual(["1", "3"]);
    const relinked: string[] = [];
    const res = await regainAccess(needs, async (id) => { relinked.push(id); });
    expect(res).toEqual({ relinked: 1, denied: 1 });
    expect(relinked).toEqual(["1"]);
  });
});

describe("findLinkedPlaceholders", () => {
  it("splits readable handles from ones that need a click", async () => {
    const a = bigFile("a.mov", 1), b = bigFile("b.mov", 2);
    handles.set("a.mov:1", fakeHandle(a, "granted"));
    handles.set("b.mov:2", fakeHandle(b, "prompt"));
    (window as unknown as { FileSystemFileHandle: unknown }).FileSystemFileHandle = class {};
    const item = (id: string, name: string, size: number) =>
      ({ id, name, isPlaceholder: true, sourceFile: { name, size, lastModified: 0 } }) as unknown as MediaItem;
    const { findLinkedPlaceholders } = await import("./linked-media");
    const res = await findLinkedPlaceholders([item("1", "a.mov", 1), item("2", "b.mov", 2), item("3", "none.mov", 3)]);
    expect(res.ready.map((r) => r.item.id)).toEqual(["1"]);
    expect(res.needAccess.map((r) => r.item.id)).toEqual(["2"]);
  });
});
