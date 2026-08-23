import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { DoneTickClient } from '../src/api/donetick-client.js';

vi.mock('axios');

describe('DoneTickClient - Complete Coverage Suite', () => {
  const baseUrl = 'https://donetick.test.local';
  const token = 'test-token-xyz';
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
    client = new DoneTickClient(baseUrl, token);
  });

  describe('Constructor & Headers', () => {
    it('should configure axios with correct baseUrl and headers', () => {
      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://donetick.test.local',
        headers: {
          'Content-Type': 'application/json',
          secretkey: token,
          Authorization: `Bearer ${token}`,
        },
        timeout: 15000,
      });
    });

    it('should strip trailing slashes from baseUrl', () => {
      new DoneTickClient('https://donetick.test.local///', token);
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://donetick.test.local',
        })
      );
    });
  });

  describe('Chores API', () => {
    it('listChores should return array of chores from /api/v1/chores', async () => {
      const mockData = [
        { id: 1, name: 'Chore 1', description: 'Clean room', status: 0 },
        { id: 2, name: 'Chore 2', description: 'Wash dishes', status: 1 },
      ];
      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockData });

      const result = await client.listChores();
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/', { params: {} });
      expect(result).toEqual(mockData);
    });

    it('listChores should unwrap res wrapper object if present', async () => {
      const mockData = [{ id: 1, name: 'Chore 1' }];
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: mockData } });

      const result = await client.listChores();
      expect(result).toEqual(mockData);
    });

    it('listChores should fallback to /eapi/v1/chore if /api/v1/chores returns 404', async () => {
      const notFoundErr = { response: { status: 404 } };
      mockAxiosInstance.get
        .mockRejectedValueOnce(notFoundErr)
        .mockResolvedValueOnce({ data: [{ id: 10, name: 'Fallback chore' }] });

      const result = await client.listChores({ includeSubtasks: true, projectId: 5 });
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(1, '/api/v1/chores/', {
        params: { includeSubtasks: true, projectId: 5 },
      });
      expect(mockAxiosInstance.get).toHaveBeenNthCalledWith(2, '/eapi/v1/chore', {
        params: { includeSubtasks: true, projectId: 5 },
      });
      expect(result).toEqual([{ id: 10, name: 'Fallback chore' }]);
    });

    it('listChores should rethrow non-404 errors', async () => {
      mockAxiosInstance.get.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Server exploded' } } });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.listChores()).rejects.toThrow('Server exploded');
    });

    it('listChores should filter by search and status', async () => {
      const mockData = [
        { id: 1, name: 'Clean Bedroom', description: 'Upstairs', status: 0 },
        { id: 2, name: 'Wash Dishes', description: 'Kitchen', status: 0 },
        { id: 3, name: 'Clean Kitchen', description: 'Floor', status: 1 },
      ];
      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockData });

      const result = await client.listChores({ search: 'clean', status: 0 });
      expect(result).toEqual([{ id: 1, name: 'Clean Bedroom', description: 'Upstairs', status: 0 }]);
    });

    it('listChores should filter by status alone', async () => {
      const mockData = [
        { id: 1, name: 'Chore 1', status: 0 },
        { id: 2, name: 'Chore 2', status: 1 },
      ];
      mockAxiosInstance.get.mockResolvedValueOnce({ data: mockData });

      const result = await client.listChores({ status: 1 });
      expect(result).toEqual([{ id: 2, name: 'Chore 2', status: 1 }]);
    });

    it('getChore should retrieve specific chore by ID without res wrapper', async () => {
      const chore = { id: 42, name: 'Fix sink' };
      mockAxiosInstance.get.mockResolvedValueOnce({ data: chore });

      const result = await client.getChore(42);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/api/v1/chores/42');
      expect(result).toEqual(chore);
    });

    it('createChore should post to /api/v1/chores with all possible optional fields', async () => {
      const created = { id: 100, name: 'Full Task' };
      mockAxiosInstance.post.mockResolvedValueOnce({ data: { res: created } });

      const result = await client.createChore({
        name: 'Full Task',
        description: 'Detailed description',
        dueDate: '2026-09-01T10:00:00Z',
        frequencyType: 'daily',
        frequency: 2,
        priority: 4,
        points: 5,
        projectId: 2,
        assignedTo: 1,
        assignStrategy: 'round_robin',
        isActive: false,
        isRolling: true,
        isPrivate: true,
        labelsV2: [{ name: 'Urgent' }],
        subTasks: [{ name: 'Step 1' }],
      });

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/api/v1/chores/', {
        name: 'Full Task',
        description: 'Detailed description',
        nextDueDate: '2026-09-01T10:00:00.000Z',
        frequencyType: 'daily',
        frequency: 2,
        priority: 4,
        points: 5,
        projectId: 2,
        assignedTo: 1,
        assignees: [],
        assignStrategy: 'round_robin',
        isActive: false,
        isRolling: true,
        isPrivate: true,
        labelsV2: [{ name: 'Urgent' }],
        subTasks: [{ name: 'Step 1', orderId: 0 }],
      });
      expect(result).toEqual(created);
    });

    it('createChore should fallback to /eapi/v1/chore on 404', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce({ response: { status: 404 } })
        .mockResolvedValueOnce({ data: { id: 101, name: 'Fallback Created' } });

      const result = await client.createChore({ name: 'Fallback Created' });
      expect(result).toEqual({ id: 101, name: 'Fallback Created' });
    });

    it('createChore should rethrow non-404 error', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Bad chore' } } });
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);

      await expect(client.createChore({ name: 'Fail' })).rejects.toThrow('Bad chore');
    });

    it('updateChore should merge existing chore properties when fields are omitted', async () => {
      const existingChore = {
        id: 5,
        name: 'Existing Name',
        frequencyType: 'weekly',
        assignStrategy: 'random',
        isPrivate: false,
        isActive: true,
        isRolling: true,
        frequency: 2,
        priority: 4,
        points: 10,
        description: 'Old desc',
        nextDueDate: '2026-09-10T00:00:00Z',
        projectId: 1,
        assignedTo: 2,
        assignees: [{ userId: 2 }],
        labelsV2: [{ name: 'OldLabel' }],
        subTasks: [{ name: 'OldSubtask' }],
        frequencyMetadata: { unit: 'weeks' },
        updatedAt: '2026-09-01T08:00:00Z',
      };

      mockAxiosInstance.get.mockResolvedValueOnce({ data: { res: existingChore } });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { message: 'Updated' } });

      const result = await client.updateChore({ id: 5 });

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/', {
        id: 5,
        name: 'Existing Name',
        frequencyType: 'weekly',
        assignStrategy: 'random',
        isPrivate: false,
        isActive: true,
        isRolling: true,
        frequency: 2,
        priority: 4,
        points: 10,
        description: 'Old desc',
        nextDueDate: '2026-09-10T00:00:00Z',
        projectId: 1,
        assignedTo: 2,
        assignees: [{ userId: 2 }],
        labelsV2: [{ name: 'OldLabel' }],
        subTasks: [{ name: 'OldSubtask', orderId: 0 }],
        frequencyMetadata: { unit: 'weeks' },
        updatedAt: '2026-09-01T08:00:00Z',
      });
      expect(result).toEqual({ message: 'Updated' });
    });

    it('updateChore should refuse to write blind when getChore fails', async () => {
      // EditChore replaces the whole chore and diffs subtasks/labels by id, so
      // proceeding without the current state would delete both server-side.
      mockAxiosInstance.get.mockRejectedValue(new Error('Fetch failed'));

      await expect(
        client.updateChore({ id: 5, name: 'Updated Name' })
      ).rejects.toThrow(/would delete its subtasks and labels/);

      expect(mockAxiosInstance.put).not.toHaveBeenCalled();
    });

    it('updateChore should send a full payload once the read succeeds', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 5, name: 'Old', updatedAt: '2026-09-01T08:00:00Z' } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { message: 'Updated' } });

      const result = await client.updateChore({
        id: 5,
        name: 'Updated Name',
        nextDueDate: '2026-10-10T00:00:00Z',
        subTasks: [{ name: 'Sub 1' }],
      });

      const payload = mockAxiosInstance.put.mock.calls[0][1];
      expect(payload.name).toBe('Updated Name');
      expect(payload.nextDueDate).toBe('2026-10-10T00:00:00.000Z');
      expect(payload.subTasks).toEqual([{ name: 'Sub 1', orderId: 0 }]);
      expect(payload.updatedAt).toBe('2026-09-01T08:00:00Z');
      expect(result).toEqual({ message: 'Updated' });
    });

    it('completeChore, undoChore, deleteChore, setPriority, skipChore, nudgeChore', async () => {
      mockAxiosInstance.post.mockResolvedValue({ data: { res: { success: true } } });
      mockAxiosInstance.put.mockResolvedValue({ data: { res: { success: true } } });
      mockAxiosInstance.delete.mockResolvedValue({ data: { message: 'Deleted' } });

      expect(await client.completeChore({ choreId: 1 })).toEqual({ success: true });
      expect(await client.undoChore(1)).toEqual({ success: true });
      expect(await client.deleteChore(1)).toBe('Deleted');
      expect(await client.setChorePriority(1, 3)).toEqual({ success: true });
      expect(await client.skipChore(1)).toEqual({ success: true });
      expect(await client.nudgeChore(1)).toEqual({ success: true });
    });

    it('setChoreDueDate echoes back the chore updatedAt, which DoneTick requires', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 1, name: 'C', updatedAt: '2026-09-01T08:00:00Z' } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: { success: true } } });

      const result = await client.setChoreDueDate(1, '2026-10-10T12:00:00Z');

      expect(mockAxiosInstance.put).toHaveBeenCalledWith('/api/v1/chores/1/dueDate', {
        dueDate: '2026-10-10T12:00:00.000Z',
        updatedAt: '2026-09-01T08:00:00Z',
      });
      expect(result).toEqual({ success: true });
    });

    it('setChoreDueDate(null) clears the due date', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { res: { id: 1, name: 'C', updatedAt: '2026-09-01T08:00:00Z' } },
      });
      mockAxiosInstance.put.mockResolvedValueOnce({ data: { res: { success: true } } });

      await client.setChoreDueDate(1, null);

      expect(mockAxiosInstance.put.mock.calls[0][1].dueDate).toBeNull();
    });

    it('setChorePriority refuses values DoneTick rejects, without a round-trip', async () => {
      await expect(client.setChorePriority(1, 5)).rejects.toThrow(/0-4/);
      await expect(client.setChorePriority(1, -1)).rejects.toThrow(/0-4/);
      expect(mockAxiosInstance.put).not.toHaveBeenCalled();
    });
  });

  describe('Projects, Things, Filters, Circles', () => {
    it('should handle all Projects, Things, Filters, and Circles endpoints successfully', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: [] });
      mockAxiosInstance.post.mockResolvedValue({ data: { res: { id: 1 } } });
      mockAxiosInstance.put.mockResolvedValue({ data: { res: { id: 1 } } });
      mockAxiosInstance.delete.mockResolvedValue({ data: { message: 'Deleted' } });

      expect(await client.listProjects()).toEqual([]);
      expect(await client.createProject({ name: 'P' })).toEqual({ id: 1 });
      expect(await client.updateProject({ id: 1, name: 'P2' })).toEqual({ id: 1 });
      expect(await client.deleteProject(1)).toBe('Deleted');

      expect(await client.listThings()).toEqual([]);
      expect(await client.createThing({ name: 'T', type: 'app' })).toEqual({ id: 1 });
      expect(await client.updateThing({ id: 1, name: 'T2', type: 'app' })).toEqual({ id: 1 });
      expect(await client.deleteThing(1)).toBe('Deleted');

      expect(await client.listFilters()).toEqual([]);
      expect(await client.getCircles()).toEqual([]);
      expect(await client.getCircleMembers()).toEqual([]);

      expect(await client.listLabels()).toEqual([]);
      expect(await client.createLabel({ name: 'L' })).toEqual({ id: 1 });
      expect(await client.updateLabel({ id: 1, name: 'L2' })).toEqual({ id: 1 });
      expect(await client.deleteLabel(1)).toEqual({ message: 'Deleted' });
    });

    it('listLabels should fallback to extracting labels from chores on 401', async () => {
      mockAxiosInstance.get
        .mockRejectedValueOnce({ response: { status: 401, data: { message: 'token contains an invalid number of segments' } } })
        .mockResolvedValueOnce({
          data: {
            res: [
              { id: 1, labelsV2: [{ id: 10, name: 'Maison', color: 'blue' }] },
              { id: 2, labelsV2: [{ id: 10, name: 'Maison', color: 'blue' }, { id: 20, name: 'Urgent' }] },
            ],
          },
        });

      const labels = await client.listLabels();
      expect(labels).toEqual([
        { id: 10, labelId: 10, name: 'Maison', color: 'blue' },
        { id: 20, labelId: 20, name: 'Urgent', color: undefined },
      ]);
    });

    it('createLabel, updateLabel, deleteLabel should provide helpful error on 401 invalid segments', async () => {
      mockAxiosInstance.post.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'token contains an invalid number of segments' } },
      });
      mockAxiosInstance.put.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'token contains an invalid number of segments' } },
      });
      mockAxiosInstance.delete.mockRejectedValueOnce({
        response: { status: 401, data: { message: 'token contains an invalid number of segments' } },
      });

      await expect(client.createLabel({ name: 'Test' })).rejects.toThrow('DoneTick limitation');
      await expect(client.updateLabel({ id: 1, name: 'Test' })).rejects.toThrow('DoneTick limitation');
      await expect(client.deleteLabel(1)).rejects.toThrow('DoneTick limitation');
    });

    it('should handle errors in Projects, Things, Filters, Circles, and Labels endpoints', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValue(false);
      mockAxiosInstance.get.mockRejectedValue(new Error('Failed get'));
      mockAxiosInstance.post.mockRejectedValue(new Error('Failed post'));
      mockAxiosInstance.put.mockRejectedValue(new Error('Failed put'));
      mockAxiosInstance.delete.mockRejectedValue(new Error('Failed delete'));

      await expect(client.createProject({ name: 'P' })).rejects.toThrow('Failed post');
      await expect(client.updateProject({ id: 1 })).rejects.toThrow('Failed put');
      await expect(client.deleteProject(1)).rejects.toThrow('Failed delete');

      await expect(client.listThings()).rejects.toThrow('Failed get');
      await expect(client.createThing({ name: 'T', type: 't' })).rejects.toThrow('Failed post');
      await expect(client.updateThing({ id: 1, name: 'T', type: 't' })).rejects.toThrow('Failed put');
      await expect(client.deleteThing(1)).rejects.toThrow('Failed delete');

      await expect(client.listFilters()).rejects.toThrow('Failed get');
      await expect(client.getCircles()).rejects.toThrow('Failed get');
      await expect(client.getCircleMembers()).rejects.toThrow('Failed get');

      await expect(client.listLabels()).rejects.toThrow('Failed get');
      await expect(client.createLabel({ name: 'L' })).rejects.toThrow('Failed post');
      await expect(client.updateLabel({ id: 1 })).rejects.toThrow('Failed put');
      await expect(client.deleteLabel(1)).rejects.toThrow('Failed delete');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle AxiosError with empty response', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(true);
      mockAxiosInstance.get.mockRejectedValueOnce({
        isAxiosError: true,
        message: 'Socket hang up',
      });

      await expect(client.listChores()).rejects.toThrow('DoneTick API Error during listChores (HTTP Unknown): Socket hang up');
    });

    it('should handle non-Error thrown objects', async () => {
      vi.mocked(axios.isAxiosError).mockReturnValueOnce(false);
      mockAxiosInstance.get.mockRejectedValueOnce('A string error');

      await expect(client.listChores()).rejects.toThrow('DoneTick API Error during listChores: A string error');
    });
  });
});
