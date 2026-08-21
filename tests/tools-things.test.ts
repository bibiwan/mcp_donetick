import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerThingTools } from '../src/tools/things.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('Thing Tools', () => {
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
      listThings: vi.fn(),
      createThing: vi.fn(),
      updateThing: vi.fn(),
      updateThingState: vi.fn(),
      deleteThing: vi.fn(),
    };

    registerThingTools(server, mockClient as unknown as DoneTickClient);
  });

  it('should register thing tools', () => {
    expect(registeredTools.has('donetick_list_things')).toBe(true);
    expect(registeredTools.has('donetick_create_thing')).toBe(true);
    expect(registeredTools.has('donetick_update_thing')).toBe(true);
    expect(registeredTools.has('donetick_set_thing_state')).toBe(true);
    expect(registeredTools.has('donetick_delete_thing')).toBe(true);
  });

  it('donetick_list_things handler should list things and handle error', async () => {
    const handler = registeredTools.get('donetick_list_things')!;
    mockClient.listThings.mockResolvedValueOnce([{ id: 1, name: 'Dishwasher' }]);

    const res = await handler();
    expect(mockClient.listThings).toHaveBeenCalled();
    expect(res.content[0].text).toContain('"count": 1');

    mockClient.listThings.mockRejectedValueOnce(new Error('Fetch error'));
    const errRes = await handler();
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to list things');
  });

  it('donetick_create_thing handler should create thing and handle error', async () => {
    const handler = registeredTools.get('donetick_create_thing')!;
    mockClient.createThing.mockResolvedValueOnce({ id: 5, name: 'Lawn Mower' });

    const res = await handler({ name: 'Lawn Mower', type: 'text', state: 'good' });
    expect(mockClient.createThing).toHaveBeenCalledWith({ name: 'Lawn Mower', type: 'text', state: 'good' });
    expect(res.content[0].text).toContain('Thing created successfully');

    mockClient.createThing.mockRejectedValueOnce(new Error('Creation error'));
    const errRes = await handler({ name: 'Lawn Mower' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to create thing');
  });

  it('donetick_update_thing handler should update thing and handle error', async () => {
    const handler = registeredTools.get('donetick_update_thing')!;
    mockClient.updateThing.mockResolvedValueOnce({ id: 5, name: 'Lawn Mower Pro' });

    const res = await handler({ id: 5, name: 'Lawn Mower Pro', type: 'text' });
    expect(mockClient.updateThing).toHaveBeenCalledWith({ id: 5, name: 'Lawn Mower Pro', type: 'text' });
    expect(res.content[0].text).toContain('Thing #5 updated successfully');

    mockClient.updateThing.mockRejectedValueOnce(new Error('Update error'));
    const errRes = await handler({ id: 5, name: 'Lawn Mower Pro' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to update thing #5');
  });

  it('donetick_set_thing_state handler should update state and handle error', async () => {
    const handler = registeredTools.get('donetick_set_thing_state')!;
    mockClient.updateThingState.mockResolvedValueOnce({ id: 5, state: 'clean' });

    const res = await handler({ id: 5, value: 'clean' });
    expect(mockClient.updateThingState).toHaveBeenCalledWith(5, 'clean');
    expect(res.content[0].text).toContain("Thing #5 state updated to 'clean'");

    mockClient.updateThingState.mockRejectedValueOnce(new Error('Invalid state'));
    const errRes = await handler({ id: 5, value: 'bad' });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to update state for thing #5');
  });

  it('donetick_delete_thing handler should delete thing and handle error', async () => {
    const handler = registeredTools.get('donetick_delete_thing')!;
    mockClient.deleteThing.mockResolvedValueOnce('Deleted');

    const res = await handler({ id: 5 });
    expect(mockClient.deleteThing).toHaveBeenCalledWith(5);
    expect(res.content[0].text).toContain('Thing #5 deleted successfully');

    mockClient.deleteThing.mockRejectedValueOnce(new Error('Delete error'));
    const errRes = await handler({ id: 5 });
    expect(errRes.isError).toBe(true);
    expect(errRes.content[0].text).toContain('Failed to delete thing #5');
  });
});
