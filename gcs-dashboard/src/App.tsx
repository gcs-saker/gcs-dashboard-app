import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { DashboardMvp } from "./features/dashboard/DashboardMvp";
import { LocalWebcamPublisher } from "./features/streaming/components/LocalWebcamPublisher";
import { StreamingSmokeDashboard } from "./features/streaming/components/StreamingSmokeDashboard";

function App() {
  const query = new URLSearchParams(window.location.search);

  if (query.get("streamingSmoke") === "1") {
    return <StreamingSmokeDashboard />;
  }

  if (query.get("webcamPublisher") === "1") {
    return <LocalWebcamPublisher />;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="*"
            element={
              <RequireAuth>
                <DashboardMvp />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
