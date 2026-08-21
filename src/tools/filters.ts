import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerFilterTools(server: McpServer, client: DoneTickClient) {
  // 1. List Filters
  server.tool(
    'donetick_list_filters',
    'List all custom filters configured in DoneTick.',
    {},
    async () => {
      try {
        const filters = await client.listFilters();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: filters.length, filters }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list filters: ${error.message}` }],
        };
      }
    }
  );
}
