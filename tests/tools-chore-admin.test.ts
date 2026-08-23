import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChoreAdminTools } from '../src/tools/chore-admin.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Chore Admin Tools', () => {
  let server: McpServer;
  let mockClient: any;
  const tools = new Map<string, Function>();

  const chore = (subTasks: any[]) => ({ id: 7, name: 'Kitchen', subTasks });

  beforeEach(() => {
    tools.clear();
    server = new McpServer({ name: 'test-server', version: '2.0.0' });
    vi.spyOn(server, 'tool').mockImplementation(((name: string, ...rest: any[]) => {
      tools.set(name, rest[rest.length - 1]);
      return server;
    }) as any);

    mockClient = {
      getChore: vi.fn(),
      updateChore: vi.fn(),
      setSubtaskCompletion: vi.fn(),
      listArchivedChores: vi.fn(),
      archiveChore: vi.fn(),
      unarchiveChore: vi.fn(),
      setChoreAssignee: vi.fn(),
      approveChore: vi.fn(),
      rejectChore: vi.fn(),
      getThingHistory: vi.fn(),
    };

    registerChoreAdminTools(server, mockClient as unknown as DoneTickClient);
  });

  it('registers every admin tool', () => {
    expect([...tools.keys()].sort()).toEqual([
      'donetick_approve_chore',
      'donetick_archive_chore',
      'donetick_complete_subtask',
      'donetick_get_thing_history',
      'donetick_list_archived_chores',
      'donetick_reject_chore',
      'donetick_remove_subtask',
      'donetick_set_chore_assignee',
      'donetick_unarchive_chore',
      'donetick_uncomplete_subtask',
    ]);
  });

  describe('subtask resolution', () => {
    beforeEach(() => {
      mockClient.getChore.mockResolvedValue(
        chore([
          { id: 44, name: 'Wipe counters' },
          { id: 45, name: 'Mop floor' },
          { id: 46, name: 'Mop hallway' },
        ])
      );
    });

    it('ticks by id', async () => {
      const res = await tools.get('donetick_complete_subtask')!({ choreId: 7, subtaskId: 45 });

      expect(mockClient.setSubtaskCompletion).toHaveBeenCalledWith(7, 45, expect.any(String));
      expect(res.content[0].text).toContain('Mop floor');
    });

    it('ticks by exact name', async () => {
      await tools.get('donetick_complete_subtask')!({ choreId: 7, subtaskName: 'mop FLOOR' });

      expect(mockClient.setSubtaskCompletion).toHaveBeenCalledWith(7, 45, expect.any(String));
    });

    it('honours an explicit completedAt', async () => {
      await tools.get('donetick_complete_subtask')!({
        choreId: 7,
        subtaskId: 44,
        completedAt: '2026-08-30T12:00:00Z',
      });

      expect(mockClient.setSubtaskCompletion).toHaveBeenCalledWith(7, 44, '2026-08-30T12:00:00Z');
    });

    it('refuses an ambiguous partial name and lists the candidates', async () => {
      const res = await tools.get('donetick_complete_subtask')!({ choreId: 7, subtaskName: 'Mop' });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('#45');
      expect(res.content[0].text).toContain('#46');
      expect(mockClient.setSubtaskCompletion).not.toHaveBeenCalled();
    });

    it('reports an unknown id with the available subtasks', async () => {
      const res = await tools.get('donetick_complete_subtask')!({ choreId: 7, subtaskId: 999 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('Wipe counters');
    });

    it('reports an unmatched name', async () => {
      const res = await tools.get('donetick_complete_subtask')!({
        choreId: 7,
        subtaskName: 'polish silver',
      });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('No subtask matching');
    });

    it('requires either an id or a name', async () => {
      const res = await tools.get('donetick_complete_subtask')!({ choreId: 7 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('subtaskId or subtaskName');
    });

    it('unticks with an explicit null', async () => {
      await tools.get('donetick_uncomplete_subtask')!({ choreId: 7, subtaskId: 44 });

      expect(mockClient.setSubtaskCompletion).toHaveBeenCalledWith(7, 44, null);
    });

    it('reports a failed untick', async () => {
      mockClient.setSubtaskCompletion.mockRejectedValue(new Error('nope'));

      const res = await tools.get('donetick_uncomplete_subtask')!({ choreId: 7, subtaskId: 44 });

      expect(res.isError).toBe(true);
    });
  });

  describe('donetick_remove_subtask', () => {
    it('keeps the others and renumbers them', async () => {
      mockClient.getChore.mockResolvedValue(
        chore([
          { id: 44, name: 'a', orderId: 0 },
          { id: 45, name: 'b', orderId: 1 },
          { id: 46, name: 'c', orderId: 2 },
        ])
      );
      mockClient.updateChore.mockResolvedValue({});

      const res = await tools.get('donetick_remove_subtask')!({ choreId: 7, subtaskId: 45 });

      const sent = mockClient.updateChore.mock.calls[0][0].subTasks;
      expect(sent.map((s: any) => s.id)).toEqual([44, 46]);
      expect(sent.map((s: any) => s.orderId)).toEqual([0, 1]);
      expect(res.content[0].text).toContain('2 subtask(s) left');
    });

    it('reports a chore with no subtasks', async () => {
      mockClient.getChore.mockResolvedValue(chore([]));

      const res = await tools.get('donetick_remove_subtask')!({ choreId: 7, subtaskId: 44 });

      expect(res.isError).toBe(true);
      expect(res.content[0].text).toContain('no subtasks');
    });
  });

  describe('archive', () => {
    it('lists archived chores', async () => {
      mockClient.listArchivedChores.mockResolvedValue([{ id: 2, name: 'Old' }]);

      const out = JSON.parse(
        (await tools.get('donetick_list_archived_chores')!({})).content[0].text
      );

      expect(out.count).toBe(1);
    });

    it('reports a failed listing', async () => {
      mockClient.listArchivedChores.mockRejectedValue(new Error('down'));

      expect((await tools.get('donetick_list_archived_chores')!({})).isError).toBe(true);
    });

    it('archives and mentions history is kept', async () => {
      mockClient.archiveChore.mockResolvedValue({});

      const res = await tools.get('donetick_archive_chore')!({ choreId: 7 });

      expect(mockClient.archiveChore).toHaveBeenCalledWith(7);
      expect(res.content[0].text).toContain('history is preserved');
    });

    it('unarchives', async () => {
      mockClient.unarchiveChore.mockResolvedValue({});

      const res = await tools.get('donetick_unarchive_chore')!({ choreId: 7 });

      expect(res.content[0].text).toContain('restored');
    });

    it('reports failures on both', async () => {
      mockClient.archiveChore.mockRejectedValue(new Error('a'));
      mockClient.unarchiveChore.mockRejectedValue(new Error('b'));

      expect((await tools.get('donetick_archive_chore')!({ choreId: 7 })).isError).toBe(true);
      expect((await tools.get('donetick_unarchive_chore')!({ choreId: 7 })).isError).toBe(true);
    });
  });

  describe('assignee and approval', () => {
    it('assigns a member', async () => {
      mockClient.setChoreAssignee.mockResolvedValue({});

      const res = await tools.get('donetick_set_chore_assignee')!({ choreId: 7, userId: 3 });

      expect(mockClient.setChoreAssignee).toHaveBeenCalledWith(7, 3);
      expect(res.content[0].text).toContain('user #3');
    });

    it('reports a failed assignment', async () => {
      mockClient.setChoreAssignee.mockRejectedValue(new Error('not in circle'));

      expect(
        (await tools.get('donetick_set_chore_assignee')!({ choreId: 7, userId: 3 })).isError
      ).toBe(true);
    });

    it('approves', async () => {
      mockClient.approveChore.mockResolvedValue({ ok: true });

      const res = await tools.get('donetick_approve_chore')!({ choreId: 7 });

      expect(res.content[0].text).toContain('approved');
    });

    it('rejects with a reason', async () => {
      mockClient.rejectChore.mockResolvedValue({ ok: true });

      await tools.get('donetick_reject_chore')!({ choreId: 7, notes: 'not clean' });

      expect(mockClient.rejectChore).toHaveBeenCalledWith(7, 'not clean');
    });

    it('reports failures on both', async () => {
      mockClient.approveChore.mockRejectedValue(new Error('a'));
      mockClient.rejectChore.mockRejectedValue(new Error('b'));

      expect((await tools.get('donetick_approve_chore')!({ choreId: 7 })).isError).toBe(true);
      expect((await tools.get('donetick_reject_chore')!({ choreId: 7 })).isError).toBe(true);
    });
  });

  describe('thing history', () => {
    it('returns the state changes', async () => {
      mockClient.getThingHistory.mockResolvedValue([{ id: 1, state: 'full' }]);

      const out = JSON.parse(
        (await tools.get('donetick_get_thing_history')!({ thingId: 4 })).content[0].text
      );

      expect(out.count).toBe(1);
      expect(out.thingId).toBe(4);
    });

    it('reports a failure', async () => {
      mockClient.getThingHistory.mockRejectedValue(new Error('down'));

      expect((await tools.get('donetick_get_thing_history')!({ thingId: 4 })).isError).toBe(true);
    });
  });
});
