// DLT Cafe: "Import folder" for the Media panel. Imports media files only,
// recursively, in path order.
import React, { useRef } from "react";
import { FolderPlus } from "lucide-react";
import {
  scanDirectoryHandle,
  scanInputFiles,
  supportsDirectoryPicker,
  type FolderScan,
} from "./folder-import";

export const FolderImportButton: React.FC<{
  disabled?: boolean;
  onScan: (scan: FolderScan) => void;
  onScanning?: (message: string) => void;
}> = ({ disabled, onScan, onScanning }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = async () => {
    if (!supportsDirectoryPicker()) {
      inputRef.current?.click();
      return;
    }
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await (window as unknown as { showDirectoryPicker(o?: { mode?: "read" }): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: "read" });
    } catch {
      return; // cancelled
    }
    onScanning?.(`Scanning “${dir.name}”…`);
    onScan(await scanDirectoryHandle(dir, undefined, (n) => onScanning?.(`Scanning “${dir.name}”… ${n} media files`)));
  };

  return (
    <>
      <button
        type="button"
        aria-label="Import folder"
        title="Import a folder (media files in all subfolders)"
        disabled={disabled}
        onClick={() => void pick()}
        className="flex shrink-0 items-center justify-center rounded-[9px] border border-border bg-bg p-[10px] text-fg-2 hover:text-fg disabled:opacity-40"
      >
        <FolderPlus size={15} aria-hidden />
      </button>
      <input
        ref={inputRef}
        type="file"
        aria-label="Import folder files"
        className="hidden"
        multiple
        // Non-standard but supported by Chrome, Edge, Safari and Firefox.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          const files = event.target.files;
          if (files && files.length) onScan(scanInputFiles(files));
          event.target.value = "";
        }}
      />
    </>
  );
};
