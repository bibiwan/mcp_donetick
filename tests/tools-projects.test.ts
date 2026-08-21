import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerProjectTools } from '../src/tools/projects.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Project Tools', () => {
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
      listProjects: vi.fn(),
      createProject: vi.fn(),
      updateProject: vi.fn(),
      deleteProject: vi.fn(),
    };

    registerProjectTools(server, mockClient as unknown as DoneTickClient);
  });

  it('should register project tools', () => {
    expect(registeredTools.has('donetick_list_projects')).toBe(true);
    expect(registeredTools.has('donetick_create_project')).toBe(true);
    expect(registeredTools.has('donetick_update_project')).toBe(true);
    expect(registeredTools.has('donetick_delete_project')).toBe(true);
  });

  it('donetick_list_projects handler should return projects list and handle error', async () => {
    const handler = registeredTools.get('donetick_list_projects')!;
    mockClient.listProjects.mockResolvedValueOnce([{ id: 1, name: 'Kitchen' }]);

    const res = await handler();
    expect(mockClient.listProjects).toHaveBeenCalled();
    expect(res.content[0].text).toContain('"count": 1');

    mockClient.listProjects.mockRejectedValueOnce(new Error('Network error'));
    const errRes = await handler();
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list projects');
  });

  it('donetick_create_project handler should create project and handle error', async () => {
    const handler = registeredTools.get('donetick_create_project')!;
    mockClient.createProject.mockResolvedValueOnce({ id: 2, name: 'Garage' });

    const res = await handler({ name: 'Garage', color: '#123456' });
    expect(mockClient.createProject).toHaveBeenCalledWith({ name: 'Garage', color: '#123456' });
    expect(res.content[0].text).toContain('Project created successfully');

    mockClient.createProject.mockRejectedValueOnce(new Error('Creation failed'));
    const errRes = await handler({ name: 'Invalid' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to create project');
  });

  it('donetick_update_project handler should update project and handle error', async () => {
    const handler = registeredTools.get('donetick_update_project')!;
    mockClient.updateProject.mockResolvedValueOnce({ id: 2, name: 'Garage Updated' });

    const res = await handler({ id: 2, name: 'Garage Updated' });
    expect(mockClient.updateProject).toHaveBeenCalledWith({ id: 2, name: 'Garage Updated' });
    expect(res.content[0].text).toContain('Project #2 updated successfully');

    mockClient.updateProject.mockRejectedValueOnce(new Error('Update failed'));
    const errRes = await handler({ id: 2 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to update project #2');
  });

  it('donetick_delete_project handler should delete project and handle error', async () => {
    const handler = registeredTools.get('donetick_delete_project')!;
    mockClient.deleteProject.mockResolvedValueOnce('Deleted');

    const res = await handler({ id: 2 });
    expect(mockClient.deleteProject).toHaveBeenCalledWith(2);
    expect(res.content[0].text).toContain('Project #2 deleted successfully');

    mockClient.deleteProject.mockRejectedValueOnce(new Error('Delete failed'));
    const errRes = await handler({ id: 2 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to delete project #2');
  });
});
