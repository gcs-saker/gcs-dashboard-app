import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SignupPage } from "./features/auth/SignupPage";

const DashboardMvp = lazy(() => import("./features/dashboard/DashboardMvp").then((module) => ({ default: module.DashboardMvp })));
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

  const authenticatedApp =
    query.get("streamingSmoke") === "1"
      ? <StreamingSmokeDashboard />
      : query.get("webcamPublisher") === "1"
        ? <LocalWebcamPublisher />
        : <DashboardMvp />;

  return (
    <BrowserRouter>
      <AuthProvider>
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
              path="*"
              element={
                <RequireAuth>
                  {authenticatedApp}
                </RequireAuth>
              }
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
