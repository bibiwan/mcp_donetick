import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTimerTools, formatDuration } from '../src/tools/timer.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Timer Tools', () => {
  let server: McpServer;
  let mockClient: any;
  const tools = new Map<string, Function>();

  const parse = (res: any) => JSON.parse(res.content[0].text);

  beforeEach(() => {
    tools.clear();
    server = new McpServer({ name: 'test-server', version: '2.0.0' });
    vi.spyOn(server, 'tool').mockImplementation(((name: string, ...rest: any[]) => {
      tools.set(name, rest[rest.length - 1]);
      return server;
    }) as any);

    mockClient = {
      startChore: vi.fn(),
      pauseChore: vi.fn(),
      getChoreTimer: vi.fn(),
      resetChoreTimer: vi.fn(),
      updateTimeSession: vi.fn(),
      deleteTimeSession: vi.fn(),
      getChoreDetail: vi.fn(),
    };

    registerTimerTools(server, mockClient as unknown as DoneTickClient);
  });

  it('registers every timer tool', () => {
    expect([...tools.keys()].sort()).toEqual([
      'donetick_adjust_time_session',
      'donetick_delete_time_session',
      'donetick_get_chore_timer',
      'donetick_pause_chore',
      'donetick_reset_chore_timer',
      'donetick_start_chore',
    ]);
  });

  describe('formatDuration', () => {
    it('renders seconds only below a minute', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(45)).toBe('45s');
    });

    it('renders minutes and pads seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s');
      expect(formatDuration(605)).toBe('10m 05s');
    });

    it('renders hours and pads both smaller units', () => {
      expect(formatDuration(3930)).toBe('1h 05m 30s');
      expect(formatDuration(7200)).toBe('2h 00m 00s');
    });

    it('rounds and clamps nonsense input', () => {
      expect(formatDuration(45.6)).toBe('46s');
      expect(formatDuration(-10)).toBe('0s');
    });
  });

  describe('start and pause', () => {
    it('starts the timer', async () => {
      mockClient.startChore.mockResolvedValue({ id: 3 });

      const res = await tools.get('donetick_start_chore')!({ choreId: 7 });

      expect(mockClient.startChore).toHaveBeenCalledWith(7);
      expect(res.content[0].text).toContain('Timer started');
    });

    it('reports a failed start', async () => {
      mockClient.startChore.mockRejectedValue(new Error('already running'));

      const res = await tools.get('donetick_start_chore')!({ choreId: 7 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('already running');
    });

    it('reports the banked time after pausing', async () => {
      mockClient.pauseChore.mockResolvedValue({});
      mockClient.getChoreDetail.mockResolvedValue({ id: 7, duration: 3930 });

      const res = await tools.get('donetick_pause_chore')!({ choreId: 7 });

      expect(res.content[0].text).toContain('1h 05m 30s');
      expect(res.content[0].text).toContain('3930s');
    });

    it('still confirms the pause when the follow-up read fails', async () => {
      mockClient.pauseChore.mockResolvedValue({});
      mockClient.getChoreDetail.mockRejectedValue(new Error('details down'));

      const res = await tools.get('donetick_pause_chore')!({ choreId: 7 });

      expect(res.isError).toBeUndefined();
      expect(res.content[0].text).toContain('0s');
    });

    it('reports a failed pause', async () => {
      mockClient.pauseChore.mockRejectedValue(new Error('not running'));

      const res = await tools.get('donetick_pause_chore')!({ choreId: 7 });

      expect(res.isError).toBe(true);
    });
  });

  describe('donetick_get_chore_timer', () => {
    it('totals the sessions and names their status', async () => {
      mockClient.getChoreTimer.mockResolvedValue([
        { id: 1, choreId: 7, duration: 600, status: 2 },
        { id: 2, choreId: 7, duration: 300, status: 1 },
      ]);
      mockClient.getChoreDetail.mockResolvedValue({ id: 7, duration: 900, startTime: null });

      const out = parse(await tools.get('donetick_get_chore_timer')!({ choreId: 7 }));

      expect(out.sessionCount).toBe(2);
      expect(out.totalSeconds).toBe(900);
      expect(out.totalHuman).toBe('15m 00s');
      expect(out.sessions[0].statusName).toBe('completed');
      expect(out.sessions[1].statusName).toBe('paused');
      expect(out.accumulatedHuman).toBe('15m 00s');
    });

    it('reports zero for a chore that was never started', async () => {
      mockClient.getChoreTimer.mockResolvedValue([]);
      mockClient.getChoreDetail.mockResolvedValue({ id: 7, duration: 0 });

      const out = parse(await tools.get('donetick_get_chore_timer')!({ choreId: 7 }));

      expect(out.sessionCount).toBe(0);
      expect(out.totalSeconds).toBe(0);
    });

    it('surfaces a running timer', async () => {
      mockClient.getChoreTimer.mockResolvedValue([{ id: 1, choreId: 7, duration: 0, status: 0 }]);
      mockClient.getChoreDetail.mockResolvedValue({
        id: 7,
        duration: 0,
        startTime: '2026-08-30T09:00:00Z',
      });

      const out = parse(await tools.get('donetick_get_chore_timer')!({ choreId: 7 }));

      expect(out.currentlyRunningSince).toBe('2026-08-30T09:00:00Z');
      expect(out.sessions[0].statusName).toBe('active');
    });

    it('degrades when /details is unavailable', async () => {
      mockClient.getChoreTimer.mockResolvedValue([{ id: 1, choreId: 7, duration: 60, status: 2 }]);
      mockClient.getChoreDetail.mockRejectedValue(new Error('down'));

      const out = parse(await tools.get('donetick_get_chore_timer')!({ choreId: 7 }));

      expect(out.accumulatedSeconds).toBeNull();
      expect(out.totalSeconds).toBe(60);
    });

    it('reports a failed read', async () => {
      mockClient.getChoreTimer.mockRejectedValue(new Error('boom'));

      const res = await tools.get('donetick_get_chore_timer')!({ choreId: 7 });

      expect(res.isError).toBe(true);
    });
  });

  describe('reset, adjust and delete', () => {
    it('resets the timer', async () => {
      mockClient.resetChoreTimer.mockResolvedValue({});

      const res = await tools.get('donetick_reset_chore_timer')!({ choreId: 7 });

      expect(mockClient.resetChoreTimer).toHaveBeenCalledWith(7);
      expect(res.content[0].text).toContain('reset to zero');
    });

    it('reports a failed reset', async () => {
      mockClient.resetChoreTimer.mockRejectedValue(new Error('nope'));

      expect((await tools.get('donetick_reset_chore_timer')!({ choreId: 7 })).isError).toBe(true);
    });

    it('adjusts a session', async () => {
      mockClient.updateTimeSession.mockResolvedValue({ ok: true });

      const res = await tools.get('donetick_adjust_time_session')!({
        choreId: 7,
        sessionId: 3,
        endTime: '2026-08-30 10:30',
      });

      expect(mockClient.updateTimeSession).toHaveBeenCalledWith({
        choreId: 7,
        sessionId: 3,
        startTime: undefined,
        endTime: '2026-08-30 10:30',
      });
      expect(res.content[0].text).toContain('adjusted');
    });

    it('refuses an adjustment with neither bound', async () => {
      const res = await tools.get('donetick_adjust_time_session')!({ choreId: 7, sessionId: 3 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('at least one');
      expect(mockClient.updateTimeSession).not.toHaveBeenCalled();
    });

    it('deletes a session', async () => {
      mockClient.deleteTimeSession.mockResolvedValue('gone');

      const res = await tools.get('donetick_delete_time_session')!({ choreId: 7, sessionId: 3 });

      expect(mockClient.deleteTimeSession).toHaveBeenCalledWith(7, 3);
      expect(res.content[0].text).toContain('deleted');
    });

    it('reports a failed delete', async () => {
      mockClient.deleteTimeSession.mockRejectedValue(new Error('nope'));

      expect(
        (await tools.get('donetick_delete_time_session')!({ choreId: 7, sessionId: 3 })).isError
      ).toBe(true);
    });
  });
});
