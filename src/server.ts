import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from './api/donetick-client.js';
import { registerChoreTools } from './tools/chores.js';
import { registerProjectTools } from './tools/projects.js';
import { registerThingTools } from './tools/things.js';
import { registerCircleTools } from './tools/circles.js';
import { registerFilterTools } from './tools/filters.js';
import { registerLabelTools } from './tools/labels.js';
import { registerHistoryTools } from './tools/history.js';
import { registerTimerTools } from './tools/timer.js';
import { registerChoreAdminTools } from './tools/chore-admin.js';

export function createDoneTickMcpServer(client: DoneTickClient): McpServer {
  const server = new McpServer({
    name: 'donetick',
    version: '2.0.0',
  });

  registerChoreTools(server, client);
  registerProjectTools(server, client);
  registerThingTools(server, client);
  registerCircleTools(server, client);
  registerFilterTools(server, client);
  registerLabelTools(server, client);
  registerHistoryTools(server, client);
  registerTimerTools(server, client);
  registerChoreAdminTools(server, client);

  return server;
}
