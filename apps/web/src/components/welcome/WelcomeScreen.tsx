// DLT Cafe: the browser's home screen is the shared HomeScreen (also used by the
// desktop app): new project, recent projects, creator styles, templates and the
// project library. The upstream welcome page (hero + three format cards) is in git
// history before this change.
import { useCallback, useEffect, lazy, Suspense } from "react";
import { useUIStore } from "../../stores/ui-store";
import { useRouter } from "../../hooks/use-router";
import { useEditorPreload } from "../../hooks/useEditorPreload";
import { HomeScreen } from "../dltcafe/home/HomeScreen";

const TemplateGallery = lazy(() =>
  import("./TemplateGallery").then((module) => ({ default: module.TemplateGallery })),
);

const LoadingView = () => <div role="status" className="p-6 text-center text-text-secondary">Loading…</div>;

interface WelcomeScreenProps {
  initialTab?: "templates" | "recent";
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ initialTab }) => {
  const skipWelcomeScreen = useUIStore((state) => state.skipWelcomeScreen);
  const { navigate } = useRouter();

  useEditorPreload(true);

  const toEditor = useCallback(() => navigate("editor"), [navigate]);

  useEffect(() => {
    if (skipWelcomeScreen) navigate("editor");
  }, [skipWelcomeScreen, navigate]);

  return (
    <div className="fixed inset-0 z-50">
      <HomeScreen
        platform="web"
        onEnterEditor={toEditor}
        initialSection={initialTab === "templates" ? "templates" : initialTab === "recent" ? "projects" : "home"}
        templates={
          <Suspense fallback={<LoadingView />}>
            <TemplateGallery onTemplateApplied={toEditor} />
          </Suspense>
        }
      />
    </div>
  );
};

export default WelcomeScreen;
