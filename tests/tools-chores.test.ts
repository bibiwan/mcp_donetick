import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChoreTools } from '../src/tools/chores.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Chore Tools', () => {
  let server: McpServer;
  let mockClient: any;
  const registeredTools: Map<string, Function> = new Map();

  beforeEach(() => {
    registeredTools.clear();

    server = new McpServer({ name: 'test-server', version: '1.0.0' });
    vi.spyOn(server, 'tool').mockImplementation(((name: string, ...rest: any[]) => {
      const handler = rest[rest.length - 1];
      registeredTools.set(name, handler);
      return server;
    }) as any);

    mockClient = {
      listChores: vi.fn(),
      getChore: vi.fn(),
      createChore: vi.fn(),
      updateChore: vi.fn(),
      completeChore: vi.fn(),
      undoChore: vi.fn(),
      deleteChore: vi.fn(),
      setChoreDueDate: vi.fn(),
      setChorePriority: vi.fn(),
      skipChore: vi.fn(),
      nudgeChore: vi.fn(),
    };

    registerChoreTools(server, mockClient as unknown as DoneTickClient);
  });

  it('should register all expected chore tools', () => {
    expect(registeredTools.has('donetick_list_chores')).toBe(true);
    expect(registeredTools.has('donetick_get_chore')).toBe(true);
    expect(registeredTools.has('donetick_create_chore')).toBe(true);
    expect(registeredTools.has('donetick_update_chore')).toBe(true);
    expect(registeredTools.has('donetick_set_chore_project')).toBe(true);
    expect(registeredTools.has('donetick_complete_chore')).toBe(true);
    expect(registeredTools.has('donetick_undo_chore')).toBe(true);
    expect(registeredTools.has('donetick_delete_chore')).toBe(true);
    expect(registeredTools.has('donetick_set_due_date')).toBe(true);
    expect(registeredTools.has('donetick_set_priority')).toBe(true);
    expect(registeredTools.has('donetick_skip_chore')).toBe(true);
    expect(registeredTools.has('donetick_nudge_chore')).toBe(true);
  });

  it('donetick_list_chores tool handler should return JSON list and handle error', async () => {
    const handler = registeredTools.get('donetick_list_chores')!;
    mockClient.listChores.mockResolvedValueOnce([{ id: 1, name: 'Task 1' }]);

    const res = await handler({ search: 'Task' });
    expect(mockClient.listChores).toHaveBeenCalledWith({ search: 'Task' });
    expect(res.content[0].text).toContain('"count": 1');

    mockClient.listChores.mockRejectedValueOnce(new Error('Connection error'));
    const errRes = await handler({});
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list chores: Connection error');
  });

  it('donetick_get_chore tool handler should return chore details and handle error', async () => {
    const handler = registeredTools.get('donetick_get_chore')!;
    mockClient.getChore.mockResolvedValueOnce({ id: 5, name: 'Chore 5' });

    const res = await handler({ choreId: 5 });
    expect(mockClient.getChore).toHaveBeenCalledWith(5);
    expect(res.content[0].text).toContain('Chore 5');

    mockClient.getChore.mockRejectedValueOnce(new Error('Not found'));
    const errRes = await handler({ choreId: 99 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to get chore #99: Not found');
  });

  it('donetick_create_chore tool handler should create chore and handle error', async () => {
    const handler = registeredTools.get('donetick_create_chore')!;
    mockClient.createChore.mockResolvedValueOnce({ id: 10, name: 'New Task' });

    const res = await handler({ name: 'New Task', priority: 2 });
    expect(mockClient.createChore).toHaveBeenCalledWith({ name: 'New Task', priority: 2 });
    expect(res.content[0].text).toContain('Chore created successfully');

    mockClient.createChore.mockRejectedValueOnce(new Error('Invalid name'));
    const errRes = await handler({ name: '' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to create chore: Invalid name');
  });

  it('donetick_update_chore tool handler should update chore and handle error', async () => {
    const handler = registeredTools.get('donetick_update_chore')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, name: 'Updated Task' });

    const res = await handler({ id: 10, name: 'Updated Task' });
    expect(mockClient.updateChore).toHaveBeenCalledWith({ id: 10, name: 'Updated Task' });
    expect(res.content[0].text).toContain('Chore #10 updated successfully');

    mockClient.updateChore.mockRejectedValueOnce(new Error('Update failed'));
    const errRes = await handler({ id: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to update chore #10: Update failed');
  });

  it('donetick_set_chore_project tool handler should attach chore to project and handle error', async () => {
    const handler = registeredTools.get('donetick_set_chore_project')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, projectId: 3 });

    const res = await handler({ choreId: 10, projectId: 3 });
    expect(mockClient.updateChore).toHaveBeenCalledWith({ id: 10, projectId: 3 });
    expect(res.content[0].text).toContain('Chore #10 attached to project #3 successfully');

    // Test detaching with 0
    await handler({ choreId: 10, projectId: 0 });
    expect(mockClient.updateChore).toHaveBeenCalledWith({ id: 10, projectId: undefined });

    mockClient.updateChore.mockRejectedValueOnce(new Error('Project not found'));
    const errRes = await handler({ choreId: 10, projectId: 99 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to attach chore #10 to project #99: Project not found');
  });

  it('donetick_complete_chore tool handler should complete chore and handle error', async () => {
    const handler = registeredTools.get('donetick_complete_chore')!;
    mockClient.completeChore.mockResolvedValueOnce({ status: 'done' });

    const res = await handler({ choreId: 10, notes: 'Finished' });
    expect(mockClient.completeChore).toHaveBeenCalledWith({ choreId: 10, notes: 'Finished' });
    expect(res.content[0].text).toContain('marked as completed');

    mockClient.completeChore.mockRejectedValueOnce(new Error('Already completed'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to complete chore #10');
  });

  it('donetick_set_chore_notifications tool handler should configure notifications and handle error', async () => {
    const handler = registeredTools.get('donetick_set_chore_notifications')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, notification: true });

    const res = await handler({ choreId: 10, enabled: true, nagging: true });
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 10,
      notification: true,
      notificationMetadata: {
        dueDate: true,
        nagging: true,
        completion: false,
        predue: false,
      },
    });
    expect(res.content[0].text).toContain('notifications configured');

    mockClient.updateChore.mockRejectedValueOnce(new Error('Config failed'));
    const errRes = await handler({ choreId: 10, enabled: false });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to configure notifications');
  });

  it('donetick_link_thing_to_chore tool handler should link thing to chore and handle error', async () => {
    const handler = registeredTools.get('donetick_link_thing_to_chore')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, frequencyType: 'trigger' });

    const res = await handler({ choreId: 10, thingId: 2, triggerState: '50', condition: 'gte' });
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 10,
      frequencyType: 'trigger',
      thingTrigger: {
        thingID: 2,
        triggerState: '50',
        condition: 'gte',
      },
    });
    expect(res.content[0].text).toContain('linked to Thing #2');

    mockClient.updateChore.mockRejectedValueOnce(new Error('Link failed'));
    const errRes = await handler({ choreId: 10, thingId: 2, triggerState: 'full' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to link thing #2 to chore #10');

    // Alias donetick_link_thing_chore
    const aliasHandler = registeredTools.get('donetick_link_thing_chore')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10 });
    const aliasRes = await aliasHandler({ choreId: 10, thingId: 2, triggerValue: '100' });
    expect(aliasRes.content[0].text).toContain('linked to Thing #2');
  });

  it('donetick_unlink_thing_from_chore tool handler should unlink thing and handle error', async () => {
    const handler = registeredTools.get('donetick_unlink_thing_from_chore')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, frequencyType: 'once' });

    const res = await handler({ choreId: 10 });
    expect(mockClient.updateChore).toHaveBeenCalledWith({ id: 10, frequencyType: 'once' });
    expect(res.content[0].text).toContain('unlinked from Thing successfully');

    mockClient.updateChore.mockRejectedValueOnce(new Error('Unlink failed'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to unlink thing from chore #10');

    // Alias donetick_unlink_thing_chore
    const aliasHandler = registeredTools.get('donetick_unlink_thing_chore')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10 });
    const aliasRes = await aliasHandler({ choreId: 10 });
    expect(aliasRes.content[0].text).toContain('unlinked from Thing');
  });

  it('donetick_set_subtasks tool handler should set subtasks and handle error', async () => {
    const handler = registeredTools.get('donetick_set_subtasks')!;
    mockClient.updateChore.mockResolvedValueOnce({ id: 10, subTasks: [{ name: 'Step 1' }] });

    const res = await handler({ choreId: 10, subtasks: ['Step 1', { name: 'Step 2', order: 1 }] });
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 10,
      subTasks: [
        { name: 'Step 1', order: 0 },
        { name: 'Step 2', order: 1 },
      ],
    });
    expect(res.content[0].text).toContain('Subtasks updated for Chore #10');

    mockClient.updateChore.mockRejectedValueOnce(new Error('Subtasks failed'));
    const errRes = await handler({ choreId: 10, subtasks: [] });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to set subtasks');
  });

  it('donetick_add_subtask tool handler should add a subtask and handle error', async () => {
    const handler = registeredTools.get('donetick_add_subtask')!;
    mockClient.getChore.mockResolvedValueOnce({ id: 10, subTasks: [{ id: 1, name: 'Existing 1' }] });
    mockClient.updateChore.mockResolvedValueOnce({ id: 10 });

    const res = await handler({ choreId: 10, title: 'New Subtask' });
    expect(mockClient.getChore).toHaveBeenCalledWith(10);
    expect(mockClient.updateChore).toHaveBeenCalledWith({
      id: 10,
      subTasks: [
        { id: 1, name: 'Existing 1', order: 0 },
        { name: 'New Subtask', order: 1 },
      ],
    });
    expect(res.content[0].text).toContain("Subtask 'New Subtask' added to Chore #10");

    mockClient.getChore.mockRejectedValueOnce(new Error('Chore not found'));
    const errRes = await handler({ choreId: 10, title: 'New' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to add subtask');
  });

  it('donetick_undo_chore tool handler should undo chore completion and handle error', async () => {
    const handler = registeredTools.get('donetick_undo_chore')!;
    mockClient.undoChore.mockResolvedValueOnce({ status: 'active' });

    const res = await handler({ choreId: 10 });
    expect(mockClient.undoChore).toHaveBeenCalledWith(10);
    expect(res.content[0].text).toContain('Chore #10 completion undone');

    mockClient.undoChore.mockRejectedValueOnce(new Error('No history'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to undo completion for chore #10');
  });

  it('donetick_delete_chore tool handler should delete chore and handle error', async () => {
    const handler = registeredTools.get('donetick_delete_chore')!;
    mockClient.deleteChore.mockResolvedValueOnce('Chore deleted');

    const res = await handler({ choreId: 10 });
    expect(mockClient.deleteChore).toHaveBeenCalledWith(10);
    expect(res.content[0].text).toContain('deleted successfully');

    mockClient.deleteChore.mockRejectedValueOnce(new Error('Not found'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to delete chore #10');
  });

  it('donetick_set_due_date tool handler should update due date and handle error', async () => {
    const handler = registeredTools.get('donetick_set_due_date')!;
    mockClient.setChoreDueDate.mockResolvedValueOnce({ nextDueDate: '2026-10-01' });

    const res = await handler({ choreId: 10, dueDate: '2026-10-01' });
    expect(mockClient.setChoreDueDate).toHaveBeenCalledWith(10, '2026-10-01');
    expect(res.content[0].text).toContain('updated to 2026-10-01');

    mockClient.setChoreDueDate.mockRejectedValueOnce(new Error('Invalid date'));
    const errRes = await handler({ choreId: 10, dueDate: 'invalid' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to set due date');
  });

  it('donetick_set_priority tool handler should update priority and handle error', async () => {
    const handler = registeredTools.get('donetick_set_priority')!;
    mockClient.setChorePriority.mockResolvedValueOnce({ priority: 4 });

    const res = await handler({ choreId: 10, priority: 4 });
    expect(mockClient.setChorePriority).toHaveBeenCalledWith(10, 4);
    expect(res.content[0].text).toContain('set to 4');

    mockClient.setChorePriority.mockRejectedValueOnce(new Error('Invalid priority'));
    const errRes = await handler({ choreId: 10, priority: 99 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to set priority');
  });

  it('donetick_skip_chore tool handler should skip chore and handle error', async () => {
    const handler = registeredTools.get('donetick_skip_chore')!;
    mockClient.skipChore.mockResolvedValueOnce({ skipped: true });

    const res = await handler({ choreId: 10 });
    expect(mockClient.skipChore).toHaveBeenCalledWith(10);
    expect(res.content[0].text).toContain('occurrence skipped');

    mockClient.skipChore.mockRejectedValueOnce(new Error('Cannot skip'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to skip chore');
  });

  it('donetick_nudge_chore tool handler should send nudge and handle error', async () => {
    const handler = registeredTools.get('donetick_nudge_chore')!;
    mockClient.nudgeChore.mockResolvedValueOnce({ nudged: true });

    const res = await handler({ choreId: 10 });
    expect(mockClient.nudgeChore).toHaveBeenCalledWith(10);
    expect(res.content[0].text).toContain('Nudge sent');

    mockClient.nudgeChore.mockRejectedValueOnce(new Error('No assignee to nudge'));
    const errRes = await handler({ choreId: 10 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to nudge chore');
  });
});
