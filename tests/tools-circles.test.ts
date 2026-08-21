import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCircleTools } from '../src/tools/circles.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Circle Tools', () => {
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
      getCircles: vi.fn(),
      getCircleMembers: vi.fn(),
    };

    registerCircleTools(server, mockClient as unknown as DoneTickClient);
  });

  it('should register circle tools', () => {
    expect(registeredTools.has('donetick_get_circle_info')).toBe(true);
    expect(registeredTools.has('donetick_list_members')).toBe(true);
  });

  it('donetick_get_circle_info handler should return circles and handle error', async () => {
    const handler = registeredTools.get('donetick_get_circle_info')!;
    mockClient.getCircles.mockResolvedValueOnce([{ id: 1, name: 'Home Circle' }]);

    const res = await handler();
    expect(mockClient.getCircles).toHaveBeenCalled();
    expect(res.content[0].text).toContain('Home Circle');

    mockClient.getCircles.mockRejectedValueOnce(new Error('Auth failed'));
    const errRes = await handler();
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to get circles');
  });

  it('donetick_list_members handler should return circle members and handle error', async () => {
    const handler = registeredTools.get('donetick_list_members')!;
    mockClient.getCircleMembers.mockResolvedValueOnce([{ id: 1, name: 'Alice' }]);

    const res = await handler();
    expect(mockClient.getCircleMembers).toHaveBeenCalled();
    expect(res.content[0].text).toContain('Alice');

    mockClient.getCircleMembers.mockRejectedValueOnce(new Error('Fetch failed'));
    const errRes = await handler();
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list members');
  });
});
