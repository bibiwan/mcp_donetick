import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerThingTools(server: McpServer, client: DoneTickClient) {
  // 1. List Things
  server.tool(
    'donetick_list_things',
    'List all things (physical objects, smart sensors, devices) tracked in DoneTick.',
    {},
    async () => {
      try {
        const things = await client.listThings();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: things.length, things }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list things: ${error.message}` }],
        };
      }
    }
  );

  // 2. Create Thing
  server.tool(
    'donetick_create_thing',
    "Create a new thing/entity in DoneTick. Note: In DoneTick, 'type' must be 'text' (default), 'number', or 'boolean'.",
    {
      name: z.string().describe('Name of the thing (e.g. Cafetière, Robot Aspirateur, Compteur Eau)'),
      type: z
        .enum(['text', 'number', 'boolean'])
        .optional()
        .describe("Data type in DoneTick: 'text' (default, for general text states like 'ok', 'active'), 'number' (numeric counter/sensor), or 'boolean' (true/false)"),
      state: z
        .string()
        .optional()
        .describe("Initial state. For 'text': any string (e.g. 'ok', 'active'). For 'number': integer string (e.g. '0'). For 'boolean': 'true' or 'false'."),
    },
    async (args) => {
      try {
        const thing = await client.createThing(args);
        return {
          content: [
            {
              type: 'text',
              text: `Thing created successfully:\n${JSON.stringify(thing, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create thing: ${error.message}` }],
        };
      }
    }
  );

  // 3. Update Thing
  server.tool(
    'donetick_update_thing',
    'Update an existing thing in DoneTick (supports partial updates).',
    {
      id: z.number().describe('The ID of the thing to update'),
      name: z.string().optional().describe('New name of the thing'),
      type: z
        .enum(['text', 'number', 'boolean'])
        .optional()
        .describe("Data type in DoneTick: 'text', 'number', or 'boolean'"),
      state: z
        .string()
        .optional()
        .describe("New state value. Must match type: any text for 'text', integer for 'number', 'true'/'false' for 'boolean'."),
    },
    async (args) => {
      try {
        const thing = await client.updateThing(args);
        return {
          content: [
            {
              type: 'text',
              text: `Thing #${args.id} updated successfully:\n${JSON.stringify(thing, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update thing #${args.id}: ${error.message}` }],
        };
      }
    }
  );

  // 3b. Set Thing State
  server.tool(
    'donetick_set_thing_state',
    'Update the state value of a thing in DoneTick (triggers associated chore triggers).',
    {
      id: z.number().describe('The ID of the thing'),
      value: z.string().describe("New state value (e.g. 'clean', '50', 'true')"),
    },
    async ({ id, value }) => {
      try {
        const result = await client.updateThingState(id, value);
        return {
          content: [
            {
              type: 'text',
              text: `Thing #${id} state updated to '${value}':\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update state for thing #${id}: ${error.message}` }],
        };
      }
    }
  );

  // 4. Delete Thing
  server.tool(
    'donetick_delete_thing',
    'Delete a thing from DoneTick.',
    {
      id: z.number().describe('The ID of the thing to delete'),
    },
    async ({ id }) => {
      try {
        const result = await client.deleteThing(id);
        return {
          content: [
            {
              type: 'text',
              text: `Thing #${id} deleted successfully.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to delete thing #${id}: ${error.message}` }],
        };
      }
    }
  );
}
