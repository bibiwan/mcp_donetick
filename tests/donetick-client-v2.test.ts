import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DoneTickClient } from '../src/api/donetick-client.js';

vi.mock('axios');

/** Covers the endpoints added in 2.0: history, timer, subtasks, archive, approval. */
describe('DoneTickClient - history, timer and lifecycle', () => {
  let mockAxiosInstance: any;
  let client: DoneTickClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };
    vi.mocked(axios.create).mockReturnValue(mockAxiosInstance);
    client = new DoneTickClient('https://donetick.test', 'tok', { timeZone: 'UTC' });
  });

  describe('getChoreDetail', () => {
    it('unwraps the res envelope', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 7, name: 'C', lastCompletedDate: '2026-08-01T10:00:00Z', duration: 120 } },
      });

      const detail = await client.getChoreDetail(7);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/7/details');
      expect(detail.lastCompletedDate).toBe('2026-08-01T10:00:00Z');
      expect(detail.duration).toBe(120);
    });

    it('surfaces the HTTP status in the error', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({
        response: { status: 500, data: { error: 'boom' } },
      });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.getChoreDetail(7)).rejects.toThrow(/HTTP 500.*boom/);
    });
  });

  describe('getChoreHistory', () => {
    it('returns the entries', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: [{ id: 1, choreId: 7, status: 1 }] },
      });

      const history = await client.getChoreHistory(7);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/7/history');
      expect(history).toHaveLength(1);
    });

    it('normalizes a non-array payload to an empty list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: null } });
      expect(await client.getChoreHistory(7)).toEqual([]);
    });
  });

  describe('getChoresHistory', () => {
    const entries = [
      { id: 1, choreId: 1, status: 1, performedAt: '2026-08-20T10:00:00Z' },
      { id: 2, choreId: 2, status: 6, performedAt: '2026-08-10T10:00:00Z' },
      { id: 3, choreId: 3, status: 1, performedAt: '2026-07-01T10:00:00Z' },
      { id: 4, choreId: 4, status: 2, performedAt: null },
    ];

    it('defaults to a 30-day window and omits the members flag', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      await client.getChoresHistory();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/history', {
        params: { limit: 30 },
      });
    });

    it('passes days as DoneTick limit and sets members when asked', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      await client.getChoresHistory({ days: 90, includeMembers: true });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/history', {
        params: { limit: 90, members: true },
      });
    });

    it('filters by status client-side', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      const result = await client.getChoresHistory({ statuses: [1] });

      expect(result.map((e) => e.id)).toEqual([1, 3]);
    });

    it('filters by a since bound', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      const result = await client.getChoresHistory({ since: '2026-08-01' });

      expect(result.map((e) => e.id)).toEqual([1, 2]);
    });

    it('filters by an until bound', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      const result = await client.getChoresHistory({ until: '2026-08-15' });

      expect(result.map((e) => e.id)).toEqual([2, 3]);
    });

    it('drops entries without a performedAt when a range is given', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      const result = await client.getChoresHistory({ since: '2000-01-01' });

      expect(result.some((e) => e.id === 4)).toBe(false);
    });

    it('combines a range with a status filter', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: entries } });

      const result = await client.getChoresHistory({ since: '2026-08-01', statuses: [1] });

      expect(result.map((e) => e.id)).toEqual([1]);
    });
  });

  describe('history entry mutation', () => {
    it('normalizes performedAt and forwards notes', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: { ok: true } } });

      await client.modifyHistoryEntry({
        choreId: 7,
        historyId: 42,
        performedAt: '2026-08-30',
        notes: 'fixed',
      });

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/7/history/42', {
        performedAt: '2026-08-30T18:00:00.000Z',
        notes: 'fixed',
      });
    });

    it('sends only the fields it was given', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.modifyHistoryEntry({ choreId: 7, historyId: 42, notes: 'only notes' });

      expect(mockAxiosInstance.put.mock.calls[0][1]).toEqual({ notes: 'only notes' });
    });

    it('deletes an entry', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { message: 'gone' } });

      expect(await client.deleteHistoryEntry(7, 42)).toBe('gone');
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith('/api/v1/chores/7/history/42');
    });
  });

  describe('timer', () => {
    it('starts and pauses', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: { res: { ok: true } } });

      await client.startChore(7);
      await client.pauseChore(7);

      expect(mockAxiosInstance.put).toHaveBeenNthCalledWith(1, '/api/v1/chores/7/start', {});
      expect(mockAxiosInstance.put).toHaveBeenNthCalledWith(2, '/api/v1/chores/7/pause', {});
    });

    it('wraps a single session object into a list', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 3, choreId: 7, duration: 90 } },
      });

      const sessions = await client.getChoreTimer(7);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].duration).toBe(90);
    });

    it('treats the all-zero placeholder session as no session', async () => {
      // DoneTick answers with an id-0 stub rather than 404 when nothing ran.
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 0, choreId: 0, duration: 0 } },
      });

      expect(await client.getChoreTimer(7)).toEqual([]);
    });

    it('passes an array payload straight through', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: [{ id: 1 }, { id: 2 }] },
      });

      expect(await client.getChoreTimer(7)).toHaveLength(2);
    });

    it('resets the timer', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.resetChoreTimer(7);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/7/timer/reset', {});
    });

    it('adjusts a session, normalizing both bounds', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateTimeSession({
        choreId: 7,
        sessionId: 3,
        startTime: '2026-08-30 09:00',
        endTime: '2026-08-30 10:30',
      });

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/7/timer/3', {
        startTime: '2026-08-30T09:00:00.000Z',
        endTime: '2026-08-30T10:30:00.000Z',
      });
    });

    it('deletes a session', async () => {
      mockAxiosInstance.delete.mockResolvedValueOnce({ data: { message: 'gone' } });

      expect(await client.deleteTimeSession(7, 3)).toBe('gone');
    });
  });

  describe('subtask completion', () => {
    it('ticks a subtask with a normalized timestamp', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.setSubtaskCompletion(7, 44, '2026-08-30T12:00:00Z');

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/7/subtask', {
        id: 44,
        choreId: 7,
        completedAt: '2026-08-30T12:00:00.000Z',
      });
    });

    it('unticks with an explicit null rather than dropping the field', async () => {
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.setSubtaskCompletion(7, 44, null);

      expect(mockAxiosInstance.put.mock.calls[0][1]).toEqual({
        id: 44,
        choreId: 7,
        completedAt: null,
      });
    });
  });

  describe('archive, assignee and approval', () => {
    it('lists archived chores', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [{ id: 2 }] } });

      expect(await client.listArchivedChores()).toHaveLength(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/archived');
    });

    it('tolerates a non-array archived payload', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: undefined } });
      expect(await client.listArchivedChores()).toEqual([]);
    });

    it('archives and unarchives', async () => {
      mockAxiosInstance.put.mockResolvedValue({ data: { res: {} } });

      await client.archiveChore(7);
      await client.unarchiveChore(7);

      expect(mockAxiosInstance.put).toHaveBeenNthCalledWith(1, '/api/v1/chores/7/archive', {});
      expect(mockAxiosInstance.put).toHaveBeenNthCalledWith(2, '/api/v1/chores/7/unarchive', {});
    });

    it('reads the chore first so the assignee call carries updatedAt', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 7, name: 'C', updatedAt: '2026-08-01T00:00:00Z' } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.setChoreAssignee(7, 3);

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/7/assignee', {
        assignee: 3,
        updatedAt: '2026-08-01T00:00:00Z',
      });
    });

    it('approves and rejects, forwarding the reason', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { res: {} } });

      await client.approveChore(7);
      await client.rejectChore(7, 'not clean');

      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(1, '/api/v1/chores/7/approve', {});
      expect(mockAxiosInstance.post).toHaveBeenNthCalledWith(2, '/api/v1/chores/7/reject', {
        notes: 'not clean',
      });
    });

    it('omits the notes key when rejecting without a reason', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: {} } });

      await client.rejectChore(7);

      expect(mockAxiosInstance.post.mock.calls[0][1]).toEqual({});
    });
  });

  describe('thing history', () => {
    it('returns the entries', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: [{ id: 1, state: 'full' }] } });

      expect(await client.getThingHistory(4)).toHaveLength(1);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/things/4/history');
    });
  });

  describe('createChore id resolution', () => {
    it('resolves the bare id DoneTick returns into the full chore', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: 37 } });
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 37, name: 'Created' } },
      });

      const created = await client.createChore({ name: 'Created' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/37');
      expect(created).toEqual({ id: 37, name: 'Created' });
    });

    it('falls back to the bare id when the follow-up read fails', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: 37 } });
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('nope'));

      expect(await client.createChore({ name: 'Created' })).toEqual({ id: 37 });
    });
  });

  describe('subtask order normalization', () => {
    it('translates order to DoneTick orderId on create', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createChore({
        name: 'C',
        subTasks: [{ name: 'b', order: 1 }, { name: 'a', order: 0 }],
      });

      expect(mockAxiosInstance.post.mock.calls[0][1].subTasks).toEqual([
        { name: 'b', orderId: 1 },
        { name: 'a', orderId: 0 },
      ]);
    });

    it('falls back to array position when no order is given', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: { id: 1 } } });

      await client.createChore({ name: 'C', subTasks: [{ name: 'a' }, { name: 'b' }] });

      expect(mockAxiosInstance.post.mock.calls[0][1].subTasks).toEqual([
        { name: 'a', orderId: 0 },
        { name: 'b', orderId: 1 },
      ]);
    });

    it('accepts orderId directly and preserves completion metadata', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 5, name: 'C', updatedAt: '2026-08-01T00:00:00Z' } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: {} } });

      await client.updateChore({
        id: 5,
        subTasks: [
          { id: 9, name: 'a', orderId: 3, completedAt: '2026-08-02T00:00:00Z' } as any,
        ],
      });

      expect(mockAxiosInstance.put.mock.calls[0][1].subTasks).toEqual([
        { id: 9, name: 'a', orderId: 3, completedAt: '2026-08-02T00:00:00Z' },
      ]);
    });
  });
});
