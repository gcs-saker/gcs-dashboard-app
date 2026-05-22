import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ControlPanel from './ControlPanel';

describe('ControlPanel', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sends a command for the selected ground vehicle CID', async () => {
    render(<ControlPanel />);

    await userEvent.click(screen.getByRole('button', { name: '■' }));

    expect(global.fetch).toHaveBeenCalledWith(
      'http://www.saker.ai.kr:8001/control/',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: 'CID001', direction: 'stop' }),
      })
    );
  });

  test('switches CID layout and sends a drone command', async () => {
    render(<ControlPanel />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'CID002');
    await userEvent.click(screen.getByRole('button', { name: '⤴️' }));

    expect(global.fetch).toHaveBeenCalledWith(
      'http://www.saker.ai.kr:8001/control/',
      expect.objectContaining({
        body: JSON.stringify({ cid: 'CID002', direction: 'ascend' }),
      })
    );
  });
});
