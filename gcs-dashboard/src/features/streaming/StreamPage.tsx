import { useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@auth/AuthProvider";
import { SelectedStreamPanel } from "@dashboard/components/SelectedStreamPanel";
import { StreamGrid } from "@dashboard/components/StreamGrid";
import { useDashboardStreams } from "@dashboard/hooks/useDashboardStreams";
import "./StreamPage.css";

export function StreamPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const handleAuthFailure = useCallback(() => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
  const { selectedStream, selectedStreamId, selectStream, streams } = useDashboardStreams({
    onAuthFailure: handleAuthFailure,
  });
  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  return (
    <main className="stream-view" aria-label="스트림 전용 화면">
      <header className="stream-view__header">
        <span>
          <strong>STREAM VIEW</strong>
          <small>접근 가능한 실시간 스트림</small>
        </span>
        <nav aria-label="스트림 화면 메뉴">
          <Link className="ops-command-button" to="/">대시보드</Link>
          <span className="stream-view__user">{currentUser?.username}</span>
          <button className="ops-command-button" onClick={handleLogout} type="button">로그아웃</button>
        </nav>
      </header>

      <section className="stream-view__content">
        <SelectedStreamPanel stream={selectedStream} />
        <StreamGrid
          className="stream-view__grid"
          onSelectStream={selectStream}
          selectedStreamId={selectedStreamId}
          streams={streams}
        />
      </section>
    </main>
  );
}
