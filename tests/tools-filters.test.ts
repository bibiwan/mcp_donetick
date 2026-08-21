import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerFilterTools } from '../src/tools/filters.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Filter Tools', () => {
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
      listFilters: vi.fn(),
    };

    registerFilterTools(server, mockClient as unknown as DoneTickClient);
  });

  it('should register filter tools', () => {
    expect(registeredTools.has('donetick_list_filters')).toBe(true);
  });

  it('donetick_list_filters handler should return filters and handle error', async () => {
    const handler = registeredTools.get('donetick_list_filters')!;
    mockClient.listFilters.mockResolvedValueOnce([{ id: 1, name: 'My High Priority Tasks' }]);

    const res = await handler();
    expect(mockClient.listFilters).toHaveBeenCalled();
    expect(res.content[0].text).toContain('My High Priority Tasks');

    mockClient.listFilters.mockRejectedValueOnce(new Error('Filter error'));
    const errRes = await handler();
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list filters');
  });
});
