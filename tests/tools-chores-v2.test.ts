import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChoreTools } from '../src/tools/chores.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

/**
 * Covers the branches of chores.ts that 2.0 changed or that were never
 * exercised: label resolution, thing triggers, subtask id preservation,
 * notification defaults and the /details merge.
 */
describe('Chore Tools - 2.0 behaviour', () => {
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
      listChores: vi.fn(),
      getChore: vi.fn(),
      getChoreDetail: vi.fn(),
      createChore: vi.fn(),
      updateChore: vi.fn(),
      completeChore: vi.fn(),
      undoChore: vi.fn(),
      deleteChore: vi.fn(),
      setChoreDueDate: vi.fn(),
      setChorePriority: vi.fn(),
      skipChore: vi.fn(),
      nudgeChore: vi.fn(),
      listLabels: vi.fn().mockResolvedValue([]),
    };

    registerChoreTools(server, mockClient as unknown as DoneTickClient);
  });

  describe('donetick_get_chore merges the /details projection', () => {
    it('exposes completion tracking and renames the misleading counter', async () => {
      mockClient.getChore.mockResolvedValue({ id: 7, name: 'Dishes', priority: 1 });
      mockClient.getChoreDetail.mockResolvedValue({
        id: 7,
        name: 'Dishes',
        lastCompletedDate: '2026-08-20T10:00:00Z',
        lastCompletedBy: 2,
        // DoneTick counts every history row here, not just completions.
        totalCompletedCount: 71,
        duration: 900,
        startTime: null,
        notes: 'left the pan',
      });

      const out = parse(await tools.get('donetick_get_chore')!({ choreId: 7 }));

      expect(out.lastCompletedDate).toBe('2026-08-20T10:00:00Z');
      expect(out.lastCompletedBy).toBe(2);
      expect(out.historyEntryCount).toBe(71);
      expect(out.totalCompletedCount).toBeUndefined();
      expect(out.timeSpentSeconds).toBe(900);
      expect(out.lastCompletionNotes).toBe('left the pan');
      expect(out.name).toBe('Dishes');
    });

    it('still returns the chore, flagged, when /details fails', async () => {
      mockClient.getChore.mockResolvedValue({ id: 7, name: 'Dishes' });
      mockClient.getChoreDetail.mockRejectedValue(new Error('details down'));

      const out = parse(await tools.get('donetick_get_chore')!({ choreId: 7 }));

      expect(out.name).toBe('Dishes');
      expect(out.detailsUnavailable).toBe(true);
    });

    it('reports an error when the chore itself cannot be read', async () => {
      mockClient.getChore.mockRejectedValue(new Error('not found'));

      const res = await tools.get('donetick_get_chore')!({ choreId: 7 });

      expect(res.isError).toBe(true);
    });
  });

  describe('donetick_create_chore', () => {
    it('accepts nextDueDate, the alias that used to be a schema error', async () => {
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', nextDueDate: '2026-09-15' });

      expect(mockClient.createChore.mock.calls[0][0].nextDueDate).toBe('2026-09-15');
    });

    it('resolves label names to ids using the existing labels', async () => {
      mockClient.listLabels.mockResolvedValue([
        { id: 3, name: 'Kitchen' },
        { id: 4, name: 'Weekly' },
      ]);
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', labels: [{ name: 'kitchen' }] });

      expect(mockClient.createChore.mock.calls[0][0].labelsV2).toEqual([
        { id: 3, labelId: 3, LabelID: 3, name: 'kitchen', color: '' },
      ]);
    });

    it('accepts a bare numeric label id', async () => {
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', labels: [9] });

      expect(mockClient.createChore.mock.calls[0][0].labelsV2).toEqual([
        { id: 9, labelId: 9, LabelID: 9, name: '', color: '' },
      ]);
    });

    it('drops a label name it cannot resolve rather than sending id 0', async () => {
      mockClient.listLabels.mockResolvedValue([{ id: 3, name: 'Kitchen' }]);
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', labels: [{ name: 'Nonexistent' }] });

      expect(mockClient.createChore.mock.calls[0][0].labelsV2).toEqual([]);
    });

    it('survives a failing label lookup', async () => {
      mockClient.listLabels.mockRejectedValue(new Error('labels need a JWT'));
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', labels: [{ name: 'Kitchen' }] });

      expect(mockClient.createChore).toHaveBeenCalled();
    });

    it('switches to a trigger frequency when a thing is linked', async () => {
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({
        name: 'C',
        thingId: 4,
        triggerValue: '50',
        triggerCondition: 'gte',
      });

      const sent = mockClient.createChore.mock.calls[0][0];
      expect(sent.frequencyType).toBe('trigger');
      expect(sent.thingTrigger).toEqual({ thingID: 4, triggerState: '50', condition: 'gte' });
    });

    it('defaults the trigger state and condition', async () => {
      mockClient.createChore.mockResolvedValue({ id: 1 });

      await tools.get('donetick_create_chore')!({ name: 'C', thingId: 4 });

      expect(mockClient.createChore.mock.calls[0][0].thingTrigger).toEqual({
        thingID: 4,
        triggerState: 'true',
        condition: 'eq',
      });
    });

    it('reports a creation failure', async () => {
      mockClient.createChore.mockRejectedValue(new Error('name required'));

      const res = await tools.get('donetick_create_chore')!({ name: '' });

      expect(res.isError).toBe(true);
    });
  });

  describe('donetick_update_chore', () => {
    it('unlinks a thing when thingId is 0', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({ id: 7, thingId: 0 });

      expect(mockClient.updateChore.mock.calls[0][0].thingTrigger).toBeUndefined();
    });

    it('links a thing and forces the trigger frequency', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({ id: 7, thingId: 4, triggerValue: 'full' });

      const sent = mockClient.updateChore.mock.calls[0][0];
      expect(sent.frequencyType).toBe('trigger');
      expect(sent.thingTrigger.triggerState).toBe('full');
    });

    it('reports an update failure', async () => {
      mockClient.updateChore.mockRejectedValue(new Error('conflict'));

      const res = await tools.get('donetick_update_chore')!({ id: 7 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('conflict');
    });

    it('resolves label names to ids, as create does', async () => {
      mockClient.listLabels.mockResolvedValue([{ id: 3, name: 'Kitchen' }]);
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({ id: 7, labels: [{ name: 'KITCHEN' }] });

      expect(mockClient.updateChore.mock.calls[0][0].labelsV2).toEqual([
        { id: 3, labelId: 3, LabelID: 3, name: 'KITCHEN', color: '' },
      ]);
    });

    it('accepts numeric label ids and keeps an explicit colour', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({
        id: 7,
        labels: [9, { id: 5, name: 'Weekly', color: '#abc' }],
      });

      expect(mockClient.updateChore.mock.calls[0][0].labelsV2).toEqual([
        { id: 9, labelId: 9, LabelID: 9, name: '', color: '' },
        { id: 5, labelId: 5, LabelID: 5, name: 'Weekly', color: '#abc' },
      ]);
    });

    it('drops unresolvable labels instead of sending id 0', async () => {
      mockClient.listLabels.mockResolvedValue([]);
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({ id: 7, labels: [{ name: 'Ghost' }] });

      expect(mockClient.updateChore.mock.calls[0][0].labelsV2).toEqual([]);
    });

    it('survives a failing label lookup during update', async () => {
      mockClient.listLabels.mockRejectedValue(new Error('JWT required'));
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_update_chore')!({ id: 7, labels: [{ name: 'Kitchen' }] });

      expect(mockClient.updateChore).toHaveBeenCalled();
    });
  });

  describe('donetick_set_chore_notifications', () => {
    it('defaults enabled to true when omitted', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      const res = await tools.get('donetick_set_chore_notifications')!({ choreId: 7 });

      const sent = mockClient.updateChore.mock.calls[0][0];
      expect(sent.notification).toBe(true);
      expect(sent.notificationMetadata).toEqual({
        dueDate: true,
        nagging: false,
        completion: false,
        predue: false,
      });
      expect(res.content[0].text).toContain('enabled: true');
    });

    it('clears the metadata when disabling', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_chore_notifications')!({ choreId: 7, enabled: false });

      const sent = mockClient.updateChore.mock.calls[0][0];
      expect(sent.notification).toBe(false);
      expect(sent.notificationMetadata).toBeUndefined();
    });

    it('passes the individual switches through', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_chore_notifications')!({
        choreId: 7,
        enabled: true,
        dueDate: false,
        nagging: true,
        completion: true,
        predue: true,
      });

      expect(mockClient.updateChore.mock.calls[0][0].notificationMetadata).toEqual({
        dueDate: false,
        nagging: true,
        completion: true,
        predue: true,
      });
    });

    it('reports a failure', async () => {
      mockClient.updateChore.mockRejectedValue(new Error('down'));

      expect(
        (await tools.get('donetick_set_chore_notifications')!({ choreId: 7 })).isError
      ).toBe(true);
    });
  });

  describe('donetick_set_subtasks preserves identity', () => {
    it('re-attaches ids and completion state by name', async () => {
      mockClient.getChore.mockResolvedValue({
        id: 7,
        name: 'Kitchen',
        subTasks: [
          { id: 44, name: 'Wipe counters', orderId: 0, completedAt: '2026-08-20T10:00:00Z' },
          { id: 45, name: 'Mop floor', orderId: 1 },
        ],
      });
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_subtasks')!({
        choreId: 7,
        subtasks: ['Mop floor', 'Wipe counters'],
      });

      expect(mockClient.updateChore.mock.calls[0][0].subTasks).toEqual([
        { id: 45, name: 'Mop floor', orderId: 0 },
        { id: 44, name: 'Wipe counters', orderId: 1, completedAt: '2026-08-20T10:00:00Z' },
      ]);
    });

    it('reports which subtasks the replacement deleted', async () => {
      mockClient.getChore.mockResolvedValue({
        id: 7,
        name: 'Kitchen',
        subTasks: [
          { id: 44, name: 'Wipe counters', orderId: 0 },
          { id: 45, name: 'Mop floor', orderId: 1 },
        ],
      });
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      const res = await tools.get('donetick_set_subtasks')!({
        choreId: 7,
        subtasks: ['Wipe counters'],
      });

      expect(res.content[0].text).toContain('1 deleted');
    });

    it('creates brand new subtasks with no id', async () => {
      mockClient.getChore.mockResolvedValue({ id: 7, name: 'Kitchen', subTasks: [] });
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_subtasks')!({ choreId: 7, subtasks: ['brand new'] });

      expect(mockClient.updateChore.mock.calls[0][0].subTasks).toEqual([
        { name: 'brand new', orderId: 0 },
      ]);
    });

    it('honours an explicitly supplied id and order', async () => {
      mockClient.getChore.mockResolvedValue({ id: 7, name: 'Kitchen', subTasks: [] });
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_subtasks')!({
        choreId: 7,
        subtasks: [{ id: 99, name: 'explicit', order: 5 }],
      });

      expect(mockClient.updateChore.mock.calls[0][0].subTasks).toEqual([
        { id: 99, name: 'explicit', orderId: 5 },
      ]);
    });

    it('still writes when the pre-read fails, without ids to preserve', async () => {
      mockClient.getChore.mockRejectedValue(new Error('read failed'));
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_subtasks')!({ choreId: 7, subtasks: ['a'] });

      expect(mockClient.updateChore.mock.calls[0][0].subTasks).toEqual([
        { name: 'a', orderId: 0 },
      ]);
    });

    it('reports a write failure', async () => {
      mockClient.getChore.mockResolvedValue({ id: 7, name: 'K', subTasks: [] });
      mockClient.updateChore.mockRejectedValue(new Error('nope'));

      expect(
        (await tools.get('donetick_set_subtasks')!({ choreId: 7, subtasks: ['a'] })).isError
      ).toBe(true);
    });
  });

  describe('donetick_add_subtask', () => {
    it('appends while keeping existing ids, orders and completion', async () => {
      mockClient.getChore.mockResolvedValue({
        id: 7,
        name: 'Kitchen',
        subTasks: [{ id: 44, name: 'a', orderId: 0, completedAt: '2026-08-20T10:00:00Z' }],
      });
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_add_subtask')!({ choreId: 7, title: 'b' });

      expect(mockClient.updateChore.mock.calls[0][0].subTasks).toEqual([
        { id: 44, name: 'a', orderId: 0, completedAt: '2026-08-20T10:00:00Z' },
        { name: 'b', orderId: 1 },
      ]);
    });

    it('reports a failure', async () => {
      mockClient.getChore.mockRejectedValue(new Error('gone'));

      expect(
        (await tools.get('donetick_add_subtask')!({ choreId: 7, title: 'b' })).isError
      ).toBe(true);
    });
  });

  describe('donetick_set_due_date', () => {
    it('forwards null so the due date is cleared', async () => {
      mockClient.setChoreDueDate.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_due_date')!({ choreId: 7, dueDate: null });

      expect(mockClient.setChoreDueDate).toHaveBeenCalledWith(7, null);
    });

    it('forwards a date-only string untouched, for the client to normalize', async () => {
      mockClient.setChoreDueDate.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_due_date')!({ choreId: 7, dueDate: '2026-09-15' });

      expect(mockClient.setChoreDueDate).toHaveBeenCalledWith(7, '2026-09-15');
    });
  });

  describe('donetick_set_chore_project', () => {
    it('detaches when projectId is 0', async () => {
      mockClient.updateChore.mockResolvedValue({ id: 7 });

      await tools.get('donetick_set_chore_project')!({ choreId: 7, projectId: 0 });

      expect(mockClient.updateChore).toHaveBeenCalledWith({ id: 7, projectId: undefined });
    });

    it('reports a failure', async () => {
      mockClient.updateChore.mockRejectedValue(new Error('no such project'));

      expect(
        (await tools.get('donetick_set_chore_project')!({ choreId: 7, projectId: 2 })).isError
      ).toBe(true);
    });
  });
});
