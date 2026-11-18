// DLT Cafe: one editor layout for browser and desktop. The desktop app wraps
// EditorInterface in this provider to turn the top bar into its title bar
// (window drag region, space for the macOS traffic lights, window controls)
// and to swap in its native export button. Browser builds use the defaults.
import React, { createContext, useContext } from "react";

export interface EditorChrome {
  readonly platform: "web" | "desktop";
  /** Make the top bar a window drag region (frameless desktop window). */
  readonly dragRegion: boolean;
  /** Left padding for the macOS traffic lights, in px. */
  readonly leadingInset: number;
  /** Replaces the browser export button (desktop: native FFmpeg export). */
  readonly exportSlot?: React.ReactNode;
  /** Extra controls at the right end of the top bar (settings, window controls). */
  readonly trailingSlot?: React.ReactNode;
}

export const WEB_CHROME: EditorChrome = { platform: "web", dragRegion: false, leadingInset: 0 };

const EditorChromeContext = createContext<EditorChrome>(WEB_CHROME);

export const EditorChromeProvider: React.FC<{ value: EditorChrome; children: React.ReactNode }> = ({ value, children }) => (
  <EditorChromeContext.Provider value={value}>{children}</EditorChromeContext.Provider>
);

export function useEditorChrome(): EditorChrome {
  return useContext(EditorChromeContext);
}

export const DRAG_STYLE = { WebkitAppRegion: "drag" } as React.CSSProperties;
export const NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as React.CSSProperties;
