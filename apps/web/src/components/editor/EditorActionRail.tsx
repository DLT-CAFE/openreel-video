import React from "react";
import {
  ToolcraftDropdownMenu as DropdownMenu,
  ToolcraftIconButton as IconButton,
  ToolcraftTooltip as Tooltip,
} from "@openreel/ui";
import { Icon } from "@/icons/Icon";
import {
  House,
  Sun,
  Moon,
  SunMoon,
  Settings,
  Circle,
  Play,
  Sparkles,
  HelpCircle,
  FileCode,
  Command,
} from "@/icons/lucide-compat";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { useThemeStore } from "../../stores/theme-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useRouter } from "../../hooks/use-router";
import { useEditorChrome } from "./shell/editor-chrome"; // DLT Cafe
import { goHome } from "./shell/go-home"; // DLT Cafe: home works on desktop too
import {
  startTour,
  ONBOARDING_KEY,
  startMoGraphTour,
  MOGRAPH_TOUR_KEY,
} from "./tour";

// DLT Cafe M2: the rail can also render as a horizontal bar in the top bar.
const RailPlacement = React.createContext<"end" | "bottom">("end");

const RailButton: React.FC<{
  label: string;
  icon: string;
  onClick: () => void;
  active?: boolean;
}> = ({ label, icon, onClick, active = false }) => (
  <Tooltip content={label} placement={React.useContext(RailPlacement)}>
    <IconButton
      label={label}
      icon={<Icon name={icon} size={16} ariaHidden />}
      size="sm"
      variant={active ? "secondary" : "ghost"}
      onClick={onClick}
    />
  </Tooltip>
);

export const EditorActionRail: React.FC<{ orientation?: "vertical" | "horizontal" }> = ({ orientation = "vertical" }) => {
  const horizontal = orientation === "horizontal"; // DLT Cafe M2
  const { undo, redo } = useProjectStore();
  const {
    openModal,
    toggleKeyframeEditor,
    keyframeEditorOpen,
    panels,
    togglePanel,
    activeModal,
  } = useUIStore();
  const { mode: themeMode, toggleTheme } = useThemeStore();
  const { openSettings } = useSettingsStore();
  const { navigate } = useRouter();
  const chrome = useEditorChrome();

  const themeLabel =
    themeMode === "auto"
      ? "System"
      : themeMode.charAt(0).toUpperCase() + themeMode.slice(1);
  const nextThemeLabel =
    themeMode === "light" ? "Dark" : themeMode === "dark" ? "System" : "Light";
  const themeIcon =
    themeMode === "light" ? (
      <Sun size={16} aria-hidden />
    ) : themeMode === "dark" ? (
      <Moon size={16} aria-hidden />
    ) : (
      <SunMoon size={16} aria-hidden />
    );
  const themeActionLabel = `Theme: ${themeLabel}. Switch to ${nextThemeLabel}`;

  return (
    <RailPlacement.Provider value={horizontal ? "bottom" : "end"}>
    <nav
      data-tour="toolbar"
      aria-label="Editor tools"
      data-orientation={orientation}
      className={horizontal
        ? "flex h-10 shrink-0 flex-row items-center gap-0.5"
        : "flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-bg-1 py-3"}
    >
      <Tooltip content="Back to home" placement={horizontal ? "bottom" : "end"}>
        <IconButton
          label="Back to home"
          icon={<House size={16} aria-hidden />}
          size="sm"
          variant="ghost"
          onClick={() => void goHome(chrome, navigate)}
        />
      </Tooltip>

      <div className={horizontal ? "mx-1.5 h-5 w-px bg-border" : "my-1.5 h-px w-6 bg-border"} />

      <RailButton
        label="Search tools, effects, or ask AI"
        icon="magnifyingglass"
        onClick={() => openModal("search")}
      />
      <RailButton
        label="Undo"
        icon="arrow.uturn.backward"
        onClick={() => void undo()}
      />
      <RailButton
        label="Redo"
        icon="arrow.uturn.forward"
        onClick={() => void redo()}
      />

      <div className={horizontal ? "mx-1.5 h-5 w-px bg-border" : "my-1.5 h-px w-6 bg-border"} />

      <RailButton
        label="Action history"
        icon="clock"
        onClick={() => openModal("history")}
        active={activeModal === "history"}
      />
      <RailButton
        label="Keyframe editor"
        icon="diamond"
        onClick={toggleKeyframeEditor}
        active={keyframeEditorOpen}
      />
      <RailButton
        label="Audio mixer"
        icon="music.note"
        onClick={() => togglePanel("audioMixer")}
        active={Boolean(panels.audioMixer?.visible)}
      />
      {/* DLT Cafe M3: AI chat + review notes moved to the Collaborate panel */}
      <RailButton
        label="Project JSON / Comments"
        icon="curlybraces"
        onClick={() => openModal("scriptView")}
      />

      {horizontal ? <div className="mx-1.5 h-5 w-px bg-border" /> : <div className="flex-1" />}

      <Tooltip content={themeActionLabel} placement={horizontal ? "bottom" : "end"}>
        <IconButton
          label={themeActionLabel}
          icon={themeIcon}
          size="sm"
          variant="secondary"
          onClick={toggleTheme}
        />
      </Tooltip>

      <DropdownMenu
        placement={horizontal ? "bottom" : "end"}
        button={{
          label: "More editor actions",
          icon: <Icon name="star" size={16} ariaHidden />,
          size: "sm",
          variant: "ghost",
          isIconOnly: true,
        }}
        hasChevron={false}
        menuWidth={224}
        items={[
          {
            label: "Settings & API keys",
            icon: <Settings size={14} aria-hidden />,
            onClick: () => openSettings(),
          },
          {
            label: "Screen recorder",
            icon: (
              <Circle
                size={14}
                className="fill-current text-status-error"
                aria-hidden
              />
            ),
            onClick: () => openModal("recorder"),
          },
          { type: "divider" },
          {
            label: "Editor tour",
            icon: <Play size={14} aria-hidden />,
            onClick: () => {
              localStorage.removeItem(ONBOARDING_KEY);
              startTour();
            },
          },
          {
            label: "Animation & effects tour",
            icon: <Sparkles size={14} className="text-accent" aria-hidden />,
            onClick: () => {
              localStorage.removeItem(MOGRAPH_TOUR_KEY);
              startMoGraphTour();
            },
          },
          { type: "divider" },
          {
            label: "Help & shortcuts (press ?)",
            icon: <HelpCircle size={14} aria-hidden />,
            isDisabled: true,
          },
          {
            label: "Project JSON",
            icon: <FileCode size={14} aria-hidden />,
            isDisabled: true,
          },
          {
            label: "Cmd+K to search",
            icon: <Command size={14} aria-hidden />,
            isDisabled: true,
          },
        ]}
      />
    </nav>
    </RailPlacement.Provider>
  );
};
