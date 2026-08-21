import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerCircleTools(server: McpServer, client: DoneTickClient) {
  // 1. Get Circle Info
  server.tool(
    'donetick_get_circle_info',
    'Retrieve information about the user circles.',
    {},
    async () => {
      try {
        const circles = await client.getCircles();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(circles, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get circles: ${error.message}` }],
        };
      }
    }
  );

  // 2. List Members
  server.tool(
    'donetick_list_members',
    'List all members/users belonging to the current DoneTick circle (useful for assigning chores).',
    {},
    async () => {
      try {
        const members = await client.getCircleMembers();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: members.length, members }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list members: ${error.message}` }],
        };
      }
    }
  );
}
