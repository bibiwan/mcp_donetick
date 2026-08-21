import { describe, it, expect } from 'vitest';
import { createDoneTickMcpServer } from '../src/server.js';
import { DoneTickClient } from '../src/api/donetick-client.js';

describe('MCP Server Factory', () => {
  it('should create and configure McpServer with all registered tools', () => {
    const client = new DoneTickClient('https://donetick.local', 'fake-token');
    const server = createDoneTickMcpServer(client);

    expect(server).toBeDefined();
  });
});
