import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { clearAuthSession, storeAuthSession } from './features/auth/authStorage';

vi.mock('./features/streaming/components/StreamingSmokeDashboard', () => ({
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Vitest requires this component inside its hoisted mock factory.
  StreamingSmokeDashboard: function MockStreamingSmokeDashboard() {
    return <div data-testid="streaming-smoke-dashboard">Streaming smoke</div>;
  },
}));

vi.mock('./features/streaming/components/LocalWebcamPublisher', () => ({
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Vitest requires this component inside its hoisted mock factory.
  LocalWebcamPublisher: function MockLocalWebcamPublisher() {
    return <div data-testid="local-webcam-publisher">Local webcam publisher</div>;
  },
}));

vi.mock('./features/dashboard/layout/StreamPage', () => ({
  // oxlint-disable-next-line unicorn/consistent-function-scoping -- Vitest requires this component inside its hoisted mock factory.
  StreamPage: function MockStreamPage() {
    return <main aria-label="스트림 전용 화면">Stream view</main>;
  },
}));

describe('App dashboard shell', () => {
  beforeEach(() => {
    storeAuthSession({
      accessToken: 'test-access-token',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: 'operator01', role: 'operator' },
    });
  });

  afterEach(() => {
    clearAuthSession();
    window.history.pushState({}, '', '/');
  });

  test('renders the core dashboard regions', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByRole('main', { name: 'Field Ops Dashboard' }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '자산트리' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '선택 스트림' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '서버 상태 상세 / 연결상태 / 헬스체크' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '지오메트리 / 텔레메트리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '운용 요약' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'AI 결과' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '스트림 화면' })).toHaveAttribute('href', '/stream');
    expect(screen.getByRole('link', { name: '스트림 화면' })).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: '자산' }));

    expect(screen.getByRole('heading', { name: '자산트리' })).toBeInTheDocument();
  });

  test('renders the streaming smoke dashboard when requested by query string', async () => {
    window.history.pushState({}, '', '/?streamingSmoke=1');

    render(<App />);

    expect(await screen.findByTestId('streaming-smoke-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('hls-player')).not.toBeInTheDocument();
  });

  test('renders the local webcam publisher when requested by query string', async () => {
    window.history.pushState({}, '', '/?webcamPublisher=1');

    render(<App />);

    expect(await screen.findByTestId('local-webcam-publisher')).toBeInTheDocument();
  });

  test('renders the local webcam publisher on the protected publisher route', () => {
    window.history.pushState({}, '', '/publisher');

    render(<App />);

    expect(screen.getByTestId('local-webcam-publisher')).toBeInTheDocument();
  });

  test('renders the protected stream-only page', async () => {
    window.history.pushState({}, '', '/stream');

    render(<App />);

    expect(await screen.findByRole('main', { name: '스트림 전용 화면' })).toBeInTheDocument();
  });

  test('redirects unauthenticated stream-only access to login', async () => {
    clearAuthSession();
    window.history.pushState({}, '', '/stream');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('redirect=%2Fstream');
  });

  test('redirects unauthenticated local webcam publisher access to login', async () => {
    clearAuthSession();
    window.history.pushState({}, '', '/publisher');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('redirect=%2Fpublisher');
  });

  test('redirects unauthenticated dashboard access to login', async () => {
    clearAuthSession();

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('redirect=%2F');
  });

  test('allows local dev dashboard UI preview without auth server', async () => {
    clearAuthSession();
    window.history.pushState({}, '', '/?uiPreview=1');

    render(<App />);

    expect(await screen.findByRole('main', { name: 'Field Ops Dashboard' }, { timeout: 10000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  test('redirects unauthenticated streaming smoke query access to login', async () => {
    clearAuthSession();
    window.history.pushState({}, '', '/?streamingSmoke=1');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(screen.queryByTestId('streaming-smoke-dashboard')).not.toBeInTheDocument();
    expect(window.location.search).toContain('streamingSmoke%3D1');
  });
});
