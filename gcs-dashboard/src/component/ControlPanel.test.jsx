import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { clearAuthSession, storeAuthSession } from '../features/auth/authStorage';
import ControlPanel from './ControlPanel';

describe('ControlPanel', () => {
  beforeEach(() => {
    storeAuthSession({
      accessToken: 'test-access-token',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      user: { username: 'operator01', role: 'operator' },
    });
    global.fetch = vi.fn(() => Promise.resolve({ ok: true }));
  });

  afterEach(() => {
    clearAuthSession();
    vi.restoreAllMocks();
  });

  test('sends a command for the selected ground vehicle CID', async () => {
    render(<ControlPanel />);

    await userEvent.click(screen.getByRole('button', { name: '■' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/control/',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-access-token',
        },
        body: JSON.stringify({ cid: 'CID001', direction: 'stop' }),
      })
    );
  });

  test('switches CID layout and sends a drone command', async () => {
    render(<ControlPanel />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'CID002');
    await userEvent.click(screen.getByRole('button', { name: '⤴️' }));

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/control/',
      expect.objectContaining({
        body: JSON.stringify({ cid: 'CID002', direction: 'ascend' }),
      })
    );
  });
});
