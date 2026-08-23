import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerHistoryTools, annotate } from '../src/tools/history.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('History Tools', () => {
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
      getChoreHistory: vi.fn(),
      getChoresHistory: vi.fn(),
      modifyHistoryEntry: vi.fn(),
      deleteHistoryEntry: vi.fn(),
      listChores: vi.fn(),
    };

    registerHistoryTools(server, mockClient as unknown as DoneTickClient);
  });

  it('registers every history tool', () => {
    expect([...tools.keys()].sort()).toEqual([
      'donetick_delete_history_entry',
      'donetick_get_chore_history',
      'donetick_get_history',
      'donetick_modify_history_entry',
    ]);
  });

  describe('annotate', () => {
    it('names each DoneTick status code', () => {
      expect(annotate({ id: 1, choreId: 1, status: 1 }).statusName).toBe('completed');
      expect(annotate({ id: 1, choreId: 1, status: 2 }).statusName).toBe('skipped');
      expect(annotate({ id: 1, choreId: 1, status: 6 }).statusName).toBe('rescheduled');
      expect(annotate({ id: 1, choreId: 1, status: 5 }).statusName).toBe('missed');
    });

    it('marks an unknown code rather than dropping it', () => {
      expect(annotate({ id: 1, choreId: 1, status: 99 }).statusName).toBe('unknown');
    });

    it('attaches the chore name when supplied', () => {
      expect(annotate({ id: 1, choreId: 1, status: 1 }, 'Dishes').choreName).toBe('Dishes');
    });
  });

  describe('donetick_get_chore_history', () => {
    const history = [
      { id: 3, choreId: 7, status: 1, performedAt: '2026-08-20T10:00:00Z', completedBy: 1 },
      { id: 2, choreId: 7, status: 6, performedAt: '2026-08-15T10:00:00Z', completedBy: 1 },
      { id: 1, choreId: 7, status: 1, performedAt: '2026-08-10T10:00:00Z', completedBy: 2 },
    ];

    it('summarizes completions separately from reschedules', async () => {
      mockClient.getChoreHistory.mockResolvedValue(history);

      const out = parse(await tools.get('donetick_get_chore_history')!({ choreId: 7 }));

      expect(out.summary.entryCount).toBe(3);
      expect(out.summary.completedCount).toBe(2);
      expect(out.summary.byStatus).toEqual({ completed: 2, rescheduled: 1 });
      expect(out.summary.lastCompletedAt).toBe('2026-08-20T10:00:00Z');
      expect(out.summary.lastCompletedBy).toBe(1);
    });

    it('filters to completions when asked', async () => {
      mockClient.getChoreHistory.mockResolvedValue(history);

      const out = parse(
        await tools.get('donetick_get_chore_history')!({ choreId: 7, onlyCompletions: true })
      );

      expect(out.entries).toHaveLength(2);
      expect(out.entries.every((e: any) => e.statusName === 'completed')).toBe(true);
    });

    it('applies the limit after computing the summary', async () => {
      mockClient.getChoreHistory.mockResolvedValue(history);

      const out = parse(await tools.get('donetick_get_chore_history')!({ choreId: 7, limit: 1 }));

      expect(out.entries).toHaveLength(1);
      expect(out.summary.entryCount).toBe(3);
    });

    it('reports an empty history without inventing a last completion', async () => {
      mockClient.getChoreHistory.mockResolvedValue([]);

      const out = parse(await tools.get('donetick_get_chore_history')!({ choreId: 7 }));

      expect(out.summary.completedCount).toBe(0);
      expect(out.summary.lastCompletedAt).toBeNull();
    });

    it('returns an error result when the call fails', async () => {
      mockClient.getChoreHistory.mockRejectedValue(new Error('nope'));

      const res = await tools.get('donetick_get_chore_history')!({ choreId: 7 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('nope');
    });
  });

  describe('donetick_get_history', () => {
    const entries = [
      { id: 2, choreId: 1, status: 1, performedAt: '2026-08-20T10:00:00Z' },
      { id: 1, choreId: 2, status: 1, performedAt: '2026-08-19T10:00:00Z' },
    ];

    it('forwards the window and resolves chore names', async () => {
      mockClient.getChoresHistory.mockResolvedValue(entries);
      mockClient.listChores.mockResolvedValue([
        { id: 1, name: 'Dishes' },
        { id: 2, name: 'Laundry' },
      ]);

      const out = parse(
        await tools.get('donetick_get_history')!({ days: 14, includeMembers: true })
      );

      expect(mockClient.getChoresHistory).toHaveBeenCalledWith({
        days: 14,
        includeMembers: true,
        since: undefined,
        until: undefined,
        statuses: undefined,
      });
      expect(out.entries[0].choreName).toBe('Dishes');
      expect(out.entries[1].choreName).toBe('Laundry');
      expect(out.window.days).toBe(14);
    });

    it('maps friendly status names onto DoneTick codes', async () => {
      mockClient.getChoresHistory.mockResolvedValue(entries);
      mockClient.listChores.mockResolvedValue([]);

      await tools.get('donetick_get_history')!({ statuses: ['completed', 'skipped'] });

      expect(mockClient.getChoresHistory.mock.calls[0][0].statuses.sort()).toEqual([1, 2]);
    });

    it('treats onlyCompletions as status 1', async () => {
      mockClient.getChoresHistory.mockResolvedValue(entries);
      mockClient.listChores.mockResolvedValue([]);

      await tools.get('donetick_get_history')!({ onlyCompletions: true });

      expect(mockClient.getChoresHistory.mock.calls[0][0].statuses).toEqual([1]);
    });

    it('still returns the history when the chore-name lookup fails', async () => {
      mockClient.getChoresHistory.mockResolvedValue(entries);
      mockClient.listChores.mockRejectedValue(new Error('names down'));

      const out = parse(await tools.get('donetick_get_history')!({}));

      expect(out.entries).toHaveLength(2);
      expect(out.entries[0].choreName).toBeUndefined();
    });

    it('defaults the reported window to 30 days', async () => {
      mockClient.getChoresHistory.mockResolvedValue([]);
      mockClient.listChores.mockResolvedValue([]);

      const out = parse(await tools.get('donetick_get_history')!({}));

      expect(out.window).toEqual({ days: 30, since: null, until: null });
    });

    it('returns an error result when the call fails', async () => {
      mockClient.getChoresHistory.mockRejectedValue(new Error('down'));

      const res = await tools.get('donetick_get_history')!({});

      expect(res.isError).toBe(true);
    });
  });

  describe('history entry mutation tools', () => {
    it('forwards a modification', async () => {
      mockClient.modifyHistoryEntry.mockResolvedValue({ ok: true });

      const res = await tools.get('donetick_modify_history_entry')!({
        choreId: 7,
        historyId: 42,
        performedAt: '2026-08-30',
        notes: 'fixed',
      });

      expect(mockClient.modifyHistoryEntry).toHaveBeenCalledWith({
        choreId: 7,
        historyId: 42,
        performedAt: '2026-08-30',
        dueDate: undefined,
        notes: 'fixed',
      });
      expect(res.content[0].text).toContain('updated');
    });

    it('reports a failed modification', async () => {
      mockClient.modifyHistoryEntry.mockRejectedValue(new Error('bad id'));

      const res = await tools.get('donetick_modify_history_entry')!({ choreId: 7, historyId: 42 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('bad id');
    });

    it('deletes an entry', async () => {
      mockClient.deleteHistoryEntry.mockResolvedValue('deleted');

      const res = await tools.get('donetick_delete_history_entry')!({ choreId: 7, historyId: 42 });

      expect(mockClient.deleteHistoryEntry).toHaveBeenCalledWith(7, 42);
      expect(res.content[0].text).toContain('deleted');
    });

    it('reports a failed delete', async () => {
      mockClient.deleteHistoryEntry.mockRejectedValue(new Error('forbidden'));

      const res = await tools.get('donetick_delete_history_entry')!({ choreId: 7, historyId: 42 });

      expect(res.isError).toBe(true);
    });
  });
});
