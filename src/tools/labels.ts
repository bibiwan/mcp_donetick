import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerLabelTools(server: McpServer, client: DoneTickClient) {
  // 1. List Labels
  server.tool(
    'donetick_list_labels',
    'List all labels available in DoneTick.',
    {},
    async () => {
      try {
        const labels = await client.listLabels();
        return {
          content: [
            {
              type: 'text' as const,
              text: `Labels (${labels.length}):\n${JSON.stringify(labels, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to list labels: ${error.message}` }],
        };
      }
    }
  );

  // 2. Create Label
  server.tool(
    'donetick_create_label',
    'Create a new label/tag in DoneTick.',
    {
      name: z.string().describe('The name of the label (required)'),
      color: z.string().optional().describe('Color for the label in hex (e.g. #FF5733) or color name'),
    },
    async ({ name, color }) => {
      try {
        const created = await client.createLabel({ name, color });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Label created successfully:\n${JSON.stringify(created, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to create label: ${error.message}` }],
        };
      }
    }
  );

  // 3. Update Label
  server.tool(
    'donetick_update_label',
    'Update an existing label in DoneTick.',
    {
      id: z.number().describe('The ID of the label to update'),
      name: z.string().optional().describe('New name of the label'),
      color: z.string().optional().describe('New color for the label'),
    },
    async ({ id, name, color }) => {
      try {
        const updated = await client.updateLabel({ id, name, color });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Label #${id} updated successfully:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to update label #${id}: ${error.message}` }],
        };
      }
    }
  );

  // 4. Delete Label
  server.tool(
    'donetick_delete_label',
    'Delete a label from DoneTick.',
    {
      id: z.number().describe('The ID of the label to delete'),
    },
    async ({ id }) => {
      try {
        const result = await client.deleteLabel(id);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Label #${id} deleted successfully:\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to delete label #${id}: ${error.message}` }],
        };
      }
    }
  );

  // 5. Set Chore Labels
  server.tool(
    'donetick_set_chore_labels',
    'Set or replace the list of labels on a specific chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore'),
      labels: z
        .array(
          z.union([
            z.number().describe('Label ID'),
            z.object({
              id: z.number().optional().describe('Label ID'),
              labelId: z.number().optional().describe('Label ID'),
              LabelID: z.number().optional().describe('Label ID'),
              name: z.string().optional().describe('Label name'),
              color: z.string().optional().describe('Label color'),
            }),
          ])
        )
        .describe('List of label IDs or label objects to attach to the chore'),
    },
    async ({ choreId, labels }) => {
      try {
        const allLabels = await client.listLabels().catch(() => []);
        const formattedLabels = labels
          .map((l) => {
            let resolvedId = 0;
            let name = '';
            let color = '';
            if (typeof l === 'number') {
              resolvedId = l;
            } else {
              resolvedId = l.id ?? l.labelId ?? (l as any).LabelID ?? 0;
              name = l.name || '';
              color = l.color || '';
              if (!resolvedId && name) {
                const match = allLabels.find((al) => al.name?.toLowerCase() === name.toLowerCase());
                if (match?.id) resolvedId = match.id;
              }
            }
            return { id: resolvedId, labelId: resolvedId, LabelID: resolvedId, name, color };
          })
          .filter((l) => l.id > 0);

        const updated = await client.updateChore({
          id: choreId,
          labelsV2: formattedLabels as any,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Labels updated for Chore #${choreId}:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to set labels for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 6. Add Chore Label
  server.tool(
    'donetick_add_chore_label',
    'Add a label to an existing chore without removing other labels.',
    {
      choreId: z.number().describe('The ID of the chore'),
      labelId: z.number().optional().describe('The ID of the label to add'),
      name: z.string().optional().describe('The name of the label (if adding by name)'),
    },
    async ({ choreId, labelId, name }) => {
      try {
        let targetId = labelId;
        if (!targetId && name) {
          const allLabels = await client.listLabels().catch(() => []);
          const match = allLabels.find((al) => al.name?.toLowerCase() === name.toLowerCase());
          if (match?.id) targetId = match.id;
        }

        if (!targetId || targetId <= 0) {
          throw new Error(`Label '${name || labelId}' not found. Please provide a valid labelId.`);
        }

        const chore = await client.getChore(choreId);
        const existing = ((chore as any).labelsV2 || []).map((l: any) => {
          const id = l.id ?? l.labelId ?? (l as any).LabelID;
          return {
            id,
            labelId: id,
            LabelID: id,
            name: l.name ?? '',
            color: l.color,
          };
        });

        if (!existing.some((l: any) => l.id === targetId)) {
          existing.push({ id: targetId, labelId: targetId, LabelID: targetId, name: name || '' });
        }

        const updated = await client.updateChore({
          id: choreId,
          labelsV2: existing,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Label added to Chore #${choreId}:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to add label to chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );
}
