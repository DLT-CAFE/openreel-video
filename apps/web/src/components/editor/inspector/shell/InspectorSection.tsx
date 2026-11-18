import React from "react";
import { ToolcraftPanelSection } from "@openreel/ui";
import { useInspectorNavigationStore } from "../../../../stores/inspector-navigation-store";
import { useUIStore } from "../../../../stores/ui-store";
import { useInspectorV2, useSectionVisible } from "../../inspector-v2/context"; // DLT Cafe M4

export interface InspectorSectionProps {
  title: string;
  defaultOpen?: boolean;
  sectionId?: string;
  children: React.ReactNode;
}

export const InspectorSection: React.FC<InspectorSectionProps> = ({
  title,
  defaultOpen = false,
  sectionId,
  children,
}) => {
  const inV2 = useInspectorV2() !== null; // DLT Cafe M4: sections open by default inside sub-tabs
  const visible = useSectionVisible(sectionId ?? title);
  const [isCollapsed, setIsCollapsed] = React.useState(!(defaultOpen || inV2));
  const sectionRef = React.useRef<HTMLDivElement>(null);
  const request = useInspectorNavigationStore((state) =>
    state.request?.sectionId === sectionId ? state.request : null,
  );
  const requestIsSelected = useUIStore((state) => Boolean(request &&
    state.selectedItems.some((item) => item.id === request.clipId)));

  React.useEffect(() => {
    if (!request || !requestIsSelected) return;
    setIsCollapsed(false);
    const frame = requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      sectionRef.current?.scrollIntoView?.({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
      sectionRef.current?.querySelector<HTMLElement>('[aria-expanded]')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [request, requestIsSelected]);

  if (!visible) return null;

  return (
    <div ref={sectionRef} data-v2-section="">
      <ToolcraftPanelSection
        title={title}
        collapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
        sectionId={sectionId}
        className="mb-4 rounded-[7px] border border-border bg-bg-1 last:border-b"
        bodyClassName="pt-0"
      >
        {children}
      </ToolcraftPanelSection>
    </div>
  );
};
