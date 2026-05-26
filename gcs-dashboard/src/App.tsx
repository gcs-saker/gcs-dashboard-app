import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { LoginPage } from "./features/auth/LoginPage";
import { RequireAuth } from "./features/auth/RequireAuth";
import { DashboardMvp } from "./features/dashboard/DashboardMvp";
import { StreamingSmokeDashboard } from "./features/streaming/components/StreamingSmokeDashboard";

function App() {
  if (new URLSearchParams(window.location.search).get("streamingSmoke") === "1") {
    return <StreamingSmokeDashboard />;
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
