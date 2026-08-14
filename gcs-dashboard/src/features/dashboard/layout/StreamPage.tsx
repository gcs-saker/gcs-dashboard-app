import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@auth/AuthProvider";
import { useDashboardStreams } from "@dashboard/hooks/controller/useDashboardStreams";
import { StreamWallTile } from "@streaming/components/StreamWallTile";
import { reconcileStreamWallSlots, type StreamWallLayout } from "@streaming/layout/streamWallLayout";
import "./StreamPage.css";

const EMPTY_STREAM_WALL: [] = [];

export function StreamPage() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const handleAuthFailure = useCallback(() => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
  const { streams, toggleStreamAiMode } = useDashboardStreams({
    initialStreams: EMPTY_STREAM_WALL,
    onAuthFailure: handleAuthFailure,
  });
  const [layout, setLayout] = useState<StreamWallLayout>("2x2");
  const [slotStreamIds, setSlotStreamIds] = useState<(string | null)[]>([]);

  useEffect(() => {
    setSlotStreamIds((current) => {
      const next = reconcileStreamWallSlots(current, streams, layout);
      return current.length === next.length && current.every((value, index) => value === next[index])
        ? current
        : next;
    });
  }, [layout, streams]);

  const streamsById = useMemo(
    () => new Map(streams.map((stream) => [stream.id, stream])),
    [streams],
  );
  const assignStream = useCallback((index: number, streamId: string | null) => {
    setSlotStreamIds((current) => current.map((value, slotIndex) => slotIndex === index ? streamId : value));
  }, []);
  const handleLogout = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  return (
    <main className="stream-view" aria-label="스트림 전용 화면">
      <header className="stream-view__header">
        <span className="stream-view__identity">
          <strong>STREAM VIEW</strong>
          <small>{streams.length}개 스트림 사용 가능</small>
        </span>
        <div className="stream-view__layout" role="group" aria-label="화면 분할">
          {(["2x2", "3x3"] as const).map((option) => (
            <button
              aria-pressed={layout === option}
              key={option}
              onClick={() => setLayout(option)}
              type="button"
            >
              {option === "2x2" ? "2 × 2" : "3 × 3"}
            </button>
          ))}
        </div>
        <nav className="stream-view__nav" aria-label="스트림 화면 메뉴">
          <Link className="stream-view__nav-link" to="/">
            <span aria-hidden="true">←</span>
            대시보드
          </Link>
          <span className="stream-view__account">
            <span className="stream-view__account-dot" aria-hidden="true" />
            <span className="stream-view__user">{currentUser?.username}</span>
          </span>
          <button className="stream-view__logout" onClick={handleLogout} type="button">로그아웃</button>
        </nav>
      </header>

      <section className={`stream-view__wall stream-view__wall--${layout}`}>
        {slotStreamIds.map((streamId, index) => (
          <StreamWallTile
            index={index}
            key={index}
            onSelect={assignStream}
            onToggleAi={toggleStreamAiMode}
            stream={streamId ? streamsById.get(streamId) ?? null : null}
            streams={streams}
          />
        ))}
      </section>
    </main>
  );
}
