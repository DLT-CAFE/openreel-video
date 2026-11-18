import { describe, it, expect } from "vitest";
import { HeadlessHost } from "./headless-host";
import { executeTool } from "./executor";
import { getTool, toolDefs } from "./registry";
import { DLTCAFE_TOOLS } from "./registry-dltcafe";
import { makeEmptyProject } from "./test-fixtures";
import type { EditingHost, ImportedMediaRef } from "./host";

describe("DLT Cafe tools", () => {
  it("merges every DLTCAFE_TOOLS entry into the registry without name clashes", () => {
    const names = toolDefs().map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of DLTCAFE_TOOLS) {
      expect(getTool(tool.name)).toBe(tool);
    }
  });

  it("import_media_from_path is a non-destructive media tool", () => {
    const tool = getTool("import_media_from_path");
    expect(tool?.domain).toBe("media");
    expect(tool?.destructive).toBe(false);
    expect(tool?.readOnly).toBe(false);
    expect((tool?.inputSchema as { required: string[] }).required).toEqual(["path"]);
  });

  it("returns UNSUPPORTED on a host without importMediaFromPath", async () => {
    const host = new HeadlessHost(makeEmptyProject());
    const res = await executeTool("import_media_from_path", { path: "~/DLT-Cafe/a.mp4" }, host);
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("UNSUPPORTED");
  });

  it("requires an open project before reading", async () => {
    let called = false;
    const host: EditingHost = Object.assign(new HeadlessHost(makeEmptyProject()), {
      requireOpenProject(): void {
        throw new Error("No project is open");
      },
      async importMediaFromPath(): Promise<ImportedMediaRef> {
        called = true;
        return { mediaId: "m", name: "a.mp4", type: "video", durationSec: 1 };
      },
    });
    const res = await executeTool("import_media_from_path", { path: "/x/a.mp4" }, host);
    expect(res.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("passes path and name to the host and returns the ref", async () => {
    let received: { path: string; name?: string } | undefined;
    const host: EditingHost = Object.assign(new HeadlessHost(makeEmptyProject()), {
      async importMediaFromPath(path: string, options?: { name?: string }): Promise<ImportedMediaRef> {
        received = { path, name: options?.name };
        return { mediaId: "m1", name: options?.name ?? "a.mp4", type: "video", durationSec: 2.5 };
      },
    });
    const res = await executeTool(
      "import_media_from_path",
      { path: "~/DLT-Cafe/clip.mov", name: "Hero" },
      host,
    );
    expect(res.ok).toBe(true);
    expect(received).toEqual({ path: "~/DLT-Cafe/clip.mov", name: "Hero" });
    expect((res.data as ImportedMediaRef).mediaId).toBe("m1");
  });

  it("rejects a missing path", async () => {
    const host: EditingHost = Object.assign(new HeadlessHost(makeEmptyProject()), {
      async importMediaFromPath(): Promise<ImportedMediaRef> {
        throw new Error("should not be called");
      },
    });
    const res = await executeTool("import_media_from_path", {}, host);
    expect(res.ok).toBe(false);
  });
});
