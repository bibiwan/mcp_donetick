import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerProjectTools(server: McpServer, client: DoneTickClient) {
  // 1. List Projects
  server.tool(
    'donetick_list_projects',
    'List all projects in the DoneTick circle.',
    {},
    async () => {
      try {
        const projects = await client.listProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: projects.length, projects }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list projects: ${error.message}` }],
        };
      }
    }
  );

  // 2. Create Project
  server.tool(
    'donetick_create_project',
    'Create a new project in DoneTick.',
    {
      name: z.string().describe('Name of the project (required)'),
      description: z.string().optional().describe('Description of the project'),
      color: z.string().optional().describe('Hex color code (e.g. #4CAF50)'),
      icon: z.string().optional().describe('Icon name or emoji'),
    },
    async (args) => {
      try {
        const project = await client.createProject(args);
        return {
          content: [
            {
              type: 'text',
              text: `Project created successfully:\n${JSON.stringify(project, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to create project: ${error.message}` }],
        };
      }
    }
  );

  // 3. Update Project
  server.tool(
    'donetick_update_project',
    'Update an existing project in DoneTick.',
    {
      id: z.number().describe('The ID of the project to update'),
      name: z.string().optional().describe('New name of the project'),
      description: z.string().optional().describe('New description of the project'),
      color: z.string().optional().describe('New hex color code'),
      icon: z.string().optional().describe('New icon name'),
    },
    async (args) => {
      try {
        const project = await client.updateProject(args);
        return {
          content: [
            {
              type: 'text',
              text: `Project #${args.id} updated successfully:\n${JSON.stringify(project, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update project #${args.id}: ${error.message}` }],
        };
      }
    }
  );

  // 4. Delete Project
  server.tool(
    'donetick_delete_project',
    'Delete a project from DoneTick.',
    {
      id: z.number().describe('The ID of the project to delete'),
    },
    async ({ id }) => {
      try {
        const result = await client.deleteProject(id);
        return {
          content: [
            {
              type: 'text',
              text: `Project #${id} deleted successfully.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to delete project #${id}: ${error.message}` }],
        };
      }
    }
  );
}
