interface EventLogHeroProps {
  isLoading: boolean;
  lastUpdatedAt: number | null;
}

export function EventLogHero({ isLoading, lastUpdatedAt }: EventLogHeroProps) {
  return (
    <header className="event-log-view__hero">
      <div>
        <span>Operations Event Center</span>
        <h2>이벤트 로그</h2>
        <p>스트리밍, 인증, 네트워크, 보안 이벤트를 시간 흐름과 운영 지표로 함께 확인합니다.</p>
      </div>
      <div className="event-log-view__sync">
        {isLoading ? <span role="status">이벤트 갱신 중</span> : <span>감시 중</span>}
        {lastUpdatedAt ? <strong>{new Date(lastUpdatedAt).toLocaleTimeString("ko-KR")} 갱신</strong> : <strong>초기화 중</strong>}
      </div>
    </header>
  );
}
