import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { SignupPage } from "./features/auth/SignupPage";
import { DashboardMvp } from "./features/dashboard/DashboardMvp";
import { LocalWebcamPublisher } from "./features/streaming/components/LocalWebcamPublisher";
import { StreamingSmokeDashboard } from "./features/streaming/components/StreamingSmokeDashboard";

function App() {
  const query = new URLSearchParams(window.location.search);

  if (query.get("streamingSmoke") === "1") {
    return <StreamingSmokeDashboard />;
  }

  const authenticatedApp =
    query.get("webcamPublisher") === "1" ? <LocalWebcamPublisher /> : <DashboardMvp />;

  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
