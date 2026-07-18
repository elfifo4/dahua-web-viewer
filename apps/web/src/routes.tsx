import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { api } from "./lib/api";
import { Header } from "./components/Header";
import { CameraTile } from "./components/CameraTile";
import { FullscreenCamera } from "./components/FullscreenCamera";

const rootRoute = createRootRoute({
  component: () => (
    <div className="flex h-full flex-col">
      <Header />
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  ),
});

function CenteredSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-ink-dim" />
    </div>
  );
}

function GridPage() {
  const { data, isPending, error } = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  if (isPending) return <CenteredSpinner />;
  if (error)
    return (
      <p className="p-8 text-sm text-err">
        Backend unreachable — is the server running? ({error.message})
      </p>
    );
  return (
    <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
      {data.channels.map((ch) => (
        <CameraTile key={ch.channel} channel={ch} />
      ))}
    </div>
  );
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: GridPage,
});

function CameraPage() {
  const { channel } = cameraRoute.useParams();
  const { data, isPending } = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  if (isPending) return <CenteredSpinner />;
  const summary = data?.channels.find((c) => c.channel === Number(channel));
  if (!summary) return <p className="p-8 text-sm text-err">Unknown camera “{channel}”.</p>;
  return <FullscreenCamera channel={summary} />;
}

const cameraRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/camera/$channel",
  component: CameraPage,
});

const routeTree = rootRoute.addChildren([indexRoute, cameraRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
