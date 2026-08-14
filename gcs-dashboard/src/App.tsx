import { lazy, Suspense } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { RequireAuth } from "./features/auth/RequireAuth";
import { createDashboardQueryClient } from "./features/queryClient";
import { clearSessionScopedCaches } from "./features/sessionScopedCache";

const dashboardQueryClient = createDashboardQueryClient();

function clearDashboardSessionState(): void {
  dashboardQueryClient.clear();
  clearSessionScopedCaches();
}

const DashboardPage = lazy(() => import("./features/dashboard/layout/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const LoginPage = lazy(() => import("./features/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const SignupPage = lazy(() => import("./features/auth/SignupPage").then((module) => ({ default: module.SignupPage })));
const StreamPage = lazy(() => import("./features/dashboard/layout/StreamPage").then((module) => ({ default: module.StreamPage })));
const LocalWebcamPublisher = lazy(() =>
  import("./features/streaming/components/LocalWebcamPublisher").then((module) => ({ default: module.LocalWebcamPublisher })),
);
const StreamingSmokeDashboard = lazy(() =>
  import("./features/streaming/components/StreamingSmokeDashboard").then((module) => ({ default: module.StreamingSmokeDashboard })),
);

function RouteFallback() {
  return (
    <main className="app-route-fallback" aria-label="화면 준비 중">
      <span />
    </main>
  );
}

function App() {
  const query = new URLSearchParams(window.location.search);
  const isLocalPreviewHost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  const isDashboardUiPreview = import.meta.env.DEV && isLocalPreviewHost && query.get("uiPreview") === "1";

  const authenticatedApp =
    query.get("streamingSmoke") === "1"
      ? <StreamingSmokeDashboard />
      : query.get("webcamPublisher") === "1"
        ? <LocalWebcamPublisher />
        : <DashboardPage />;

  return (
    <QueryClientProvider client={dashboardQueryClient}>
      <BrowserRouter>
        <AuthProvider onSessionCleared={clearDashboardSessionState}>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route
                path="/publisher"
                element={
                  <RequireAuth>
                    <LocalWebcamPublisher />
                  </RequireAuth>
                }
              />
              <Route
                path="/stream"
                element={
                  <RequireAuth>
                    <StreamPage />
                  </RequireAuth>
                }
              />
              <Route
                path="*"
                element={
                  isDashboardUiPreview ? (
                    authenticatedApp
                  ) : (
                    <RequireAuth>
                      {authenticatedApp}
                    </RequireAuth>
                  )
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
