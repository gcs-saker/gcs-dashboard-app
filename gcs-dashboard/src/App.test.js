import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

jest.mock('./component/MainMap', () => function MockMainMap({ setTelemetryMap }) {
  return (
    <section aria-label="mock-map">
      <button
        type="button"
        onClick={() => setTelemetryMap({
          'node-001': {
            latitude: 35.82599,
            longitude: 128.75597,
            altitude: 120.4,
            magneticX: 1.1,
            magneticY: 2.2,
            magneticZ: 3.3,
            soc: 78,
            phoneBatterySOC: 91,
            velocity: 2.5,
            totalDistance: 14.2,
            epochTime: 1716350400,
            portDistance: 7.7,
          },
        })}
      >
        load telemetry
      </button>
    </section>
  );
});

jest.mock('./component/HLSPlayer', () => function MockHLSPlayer() {
  return <div data-testid="hls-player">HLS player</div>;
});

jest.mock('./component/ControlPanel', () => function MockControlPanel() {
  return <div data-testid="control-panel">Control panel</div>;
});

jest.mock('./component/TelemetryDashboard', () => function MockTelemetryDashboard({ data }) {
  return <div data-testid="telemetry-dashboard">samples:{data?.length ?? 0}</div>;
});

describe('App dashboard shell', () => {
  test('renders the core dashboard regions', () => {
    render(<App />);

    expect(screen.getByText(/GCS SAKER/)).toBeInTheDocument();
    expect(screen.getByTestId('hls-player')).toBeInTheDocument();
    expect(screen.getByTestId('control-panel')).toBeInTheDocument();
    expect(screen.getByLabelText('mock-map')).toBeInTheDocument();
    expect(screen.getByText('노드를 선택하면 위치 정보가 표시됩니다.')).toBeInTheDocument();
  });

  test('loads telemetry, selects a node, and renders selected node details', async () => {
    render(<App />);

    await userEvent.click(screen.getByRole('button', { name: /load telemetry/i }));
    await userEvent.selectOptions(screen.getByRole('combobox'), 'node-001');

    expect(screen.getAllByText('node-001')).toHaveLength(2);
    expect(screen.getByText(/위도: 35\.82599/)).toBeInTheDocument();
    expect(screen.getByText(/고도: 120\.4 m/)).toBeInTheDocument();
    expect(screen.getByText(/무인체 배터리 : 78 %/)).toBeInTheDocument();
    expect(screen.getByTestId('telemetry-dashboard')).toHaveTextContent('samples:1');
  });
});