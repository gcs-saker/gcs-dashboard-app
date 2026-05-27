import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import App from './App';
import { clearAccessToken, storeAccessToken } from './features/auth/authStorage';

vi.mock('./features/streaming/components/StreamingSmokeDashboard', () => ({
  StreamingSmokeDashboard: function MockStreamingSmokeDashboard() {
    return <div data-testid="streaming-smoke-dashboard">Streaming smoke</div>;
  },
}));

vi.mock('./features/streaming/components/LocalWebcamPublisher', () => ({
  LocalWebcamPublisher: function MockLocalWebcamPublisher() {
    return <div data-testid="local-webcam-publisher">Local webcam publisher</div>;
  },
}));

describe('App dashboard shell', () => {
  beforeEach(() => {
    storeAccessToken('test-access-token');
  });

  afterEach(() => {
    clearAccessToken();
    window.history.pushState({}, '', '/');
  });

  test('renders the core dashboard regions', () => {
    render(<App />);

    expect(screen.getByRole('main', { name: 'Field Ops Dashboard MVP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '자산트리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '지도' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '선택 스트림' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '서버상태 / 연결상태 / 헬스체크' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '지오메트리 / 텔레메트리' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI 결과' })).toBeInTheDocument();
  });

  test('renders the streaming smoke dashboard when requested by query string', () => {
    window.history.pushState({}, '', '/?streamingSmoke=1');

    render(<App />);

    expect(screen.getByTestId('streaming-smoke-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('hls-player')).not.toBeInTheDocument();
  });

  test('renders the local webcam publisher when requested by query string', () => {
    window.history.pushState({}, '', '/?webcamPublisher=1');

    render(<App />);

    expect(screen.getByTestId('local-webcam-publisher')).toBeInTheDocument();
  });

  test('renders the local webcam publisher on the protected publisher route', () => {
    window.history.pushState({}, '', '/publisher');

    render(<App />);

    expect(screen.getByTestId('local-webcam-publisher')).toBeInTheDocument();
  });

  test('redirects unauthenticated local webcam publisher access to login', async () => {
    clearAccessToken();
    window.history.pushState({}, '', '/publisher');

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('redirect=%2Fpublisher');
  });

  test('redirects unauthenticated dashboard access to login', async () => {
    clearAccessToken();

    render(<App />);

    expect(await screen.findByRole('heading', { name: '대시보드 로그인' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(window.location.search).toContain('redirect=%2F');
  });
});
