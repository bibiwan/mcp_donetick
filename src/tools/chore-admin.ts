import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';
import { SubTask } from '../types/donetick.js';

/**
 * Tools that operate on a chore's lifecycle rather than its content:
 * per-subtask completion, archiving, reassignment and approval.
 */
export function registerChoreAdminTools(server: McpServer, client: DoneTickClient) {
  /** Resolves a subtask by id, or by exact-then-partial name match. */
  async function findSubtask(
    choreId: number,
    subtaskId: number | undefined,
    subtaskName: string | undefined
  ): Promise<SubTask & { id: number }> {
    const chore = await client.getChore(choreId);
    const subs = ((chore.subTasks ?? []) as (SubTask & { id: number })[]).filter((s) => s.id !== undefined);

    if (!subs.length) {
      throw new Error(`Chore #${choreId} has no subtasks.`);
    }
    if (subtaskId !== undefined) {
      const found = subs.find((s) => s.id === subtaskId);
      if (!found) {
        throw new Error(
          `Chore #${choreId} has no subtask #${subtaskId}. Available: ` +
            subs.map((s) => `#${s.id} "${s.name}"`).join(', ')
        );
      }
      return found;
    }
    if (subtaskName === undefined) {
      throw new Error('Provide either subtaskId or subtaskName.');
    }

    const needle = subtaskName.trim().toLowerCase();
    const exact = subs.filter((s) => s.name?.trim().toLowerCase() === needle);
    const candidates = exact.length ? exact : subs.filter((s) => s.name?.toLowerCase().includes(needle));

    if (!candidates.length) {
      throw new Error(
        `No subtask matching "${subtaskName}" on chore #${choreId}. Available: ` +
          subs.map((s) => `#${s.id} "${s.name}"`).join(', ')
      );
    }
    if (candidates.length > 1) {
      throw new Error(
        `"${subtaskName}" matches several subtasks on chore #${choreId}: ` +
          candidates.map((s) => `#${s.id} "${s.name}"`).join(', ') +
          '. Pass subtaskId instead.'
      );
    }
    return candidates[0];
  }

  // 1. Tick a subtask
  server.tool(
    'donetick_complete_subtask',
    'Tick a single subtask as done, without touching the parent chore. Note that completing the ' +
      'parent chore does NOT tick its subtasks — on a recurring chore DoneTick clears them all ' +
      'instead, ready for the next occurrence.',
    {
      choreId: z.number().describe('The ID of the chore'),
      subtaskId: z.number().optional().describe('The ID of the subtask (preferred)'),
      subtaskName: z.string().optional().describe('Name of the subtask, if its ID is unknown'),
      completedAt: z
        .string()
        .optional()
        .describe('When it was done (RFC3339 or YYYY-MM-DD); defaults to now'),
    },
    async ({ choreId, subtaskId, subtaskName, completedAt }) => {
      try {
        const subtask = await findSubtask(choreId, subtaskId, subtaskName);
        await client.setSubtaskCompletion(choreId, subtask.id, completedAt ?? new Date().toISOString());
        return {
          content: [
            {
              type: 'text' as const,
              text: `Subtask #${subtask.id} ("${subtask.name}") of chore #${choreId} marked as done.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to complete subtask on chore #${choreId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 2. Untick a subtask
  server.tool(
    'donetick_uncomplete_subtask',
    'Untick a subtask, marking it as not done again.',
    {
      choreId: z.number().describe('The ID of the chore'),
      subtaskId: z.number().optional().describe('The ID of the subtask (preferred)'),
      subtaskName: z.string().optional().describe('Name of the subtask, if its ID is unknown'),
    },
    async ({ choreId, subtaskId, subtaskName }) => {
      try {
        const subtask = await findSubtask(choreId, subtaskId, subtaskName);
        await client.setSubtaskCompletion(choreId, subtask.id, null);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Subtask #${subtask.id} ("${subtask.name}") of chore #${choreId} marked as not done.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to uncomplete subtask on chore #${choreId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 3. Remove a subtask
  server.tool(
    'donetick_remove_subtask',
    'Delete one subtask from a chore, leaving the others untouched. Unlike ' +
      'donetick_set_subtasks this does not rewrite the whole list.',
    {
      choreId: z.number().describe('The ID of the chore'),
      subtaskId: z.number().optional().describe('The ID of the subtask to remove (preferred)'),
      subtaskName: z.string().optional().describe('Name of the subtask, if its ID is unknown'),
    },
    async ({ choreId, subtaskId, subtaskName }) => {
      try {
        const subtask = await findSubtask(choreId, subtaskId, subtaskName);
        const chore = await client.getChore(choreId);
        const remaining = ((chore.subTasks ?? []) as (SubTask & { id: number })[])
          .filter((s) => s.id !== subtask.id)
          .map((s, idx) => ({ ...s, orderId: idx }));

        await client.updateChore({ id: choreId, subTasks: remaining as SubTask[] });
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Subtask #${subtask.id} ("${subtask.name}") removed from chore #${choreId}. ` +
                `${remaining.length} subtask(s) left.`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to remove subtask from chore #${choreId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 4. Archived chores
  server.tool(
    'donetick_list_archived_chores',
    'List archived chores. These are hidden from donetick_list_chores, so use this to find a ' +
      'chore that seems to have disappeared.',
    {},
    async () => {
      try {
        const chores = await client.listArchivedChores();
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ count: chores.length, chores }, null, 2) },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to list archived chores: ${error.message}` }],
        };
      }
    }
  );

  server.tool(
    'donetick_archive_chore',
    'Archive a chore: it stops appearing in the active list but keeps its history. Prefer this ' +
      'over donetick_delete_chore, which is irreversible.',
    {
      choreId: z.number().describe('The ID of the chore to archive'),
    },
    async ({ choreId }) => {
      try {
        await client.archiveChore(choreId);
        return {
          content: [{ type: 'text' as const, text: `Chore #${choreId} archived. Its history is preserved.` }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to archive chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  server.tool(
    'donetick_unarchive_chore',
    'Restore an archived chore back into the active list.',
    {
      choreId: z.number().describe('The ID of the chore to restore'),
    },
    async ({ choreId }) => {
      try {
        await client.unarchiveChore(choreId);
        return {
          content: [{ type: 'text' as const, text: `Chore #${choreId} restored to the active list.` }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to unarchive chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 5. Assignee
  server.tool(
    'donetick_set_chore_assignee',
    'Assign a chore to a circle member. Use donetick_list_members to find user IDs.',
    {
      choreId: z.number().describe('The ID of the chore'),
      userId: z.number().describe('The ID of the user to assign it to'),
    },
    async ({ choreId, userId }) => {
      try {
        await client.setChoreAssignee(choreId, userId);
        return {
          content: [{ type: 'text' as const, text: `Chore #${choreId} assigned to user #${userId}.` }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to assign chore #${choreId} to user #${userId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 6. Approval workflow
  server.tool(
    'donetick_approve_chore',
    'Approve a completion that is awaiting review, for chores configured with requireApproval.',
    {
      choreId: z.number().describe('The ID of the chore whose completion should be approved'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.approveChore(choreId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Completion of chore #${choreId} approved.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to approve chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  server.tool(
    'donetick_reject_chore',
    'Reject a completion that is awaiting review, optionally explaining why.',
    {
      choreId: z.number().describe('The ID of the chore whose completion should be rejected'),
      notes: z.string().optional().describe('Reason for the rejection'),
    },
    async ({ choreId, notes }) => {
      try {
        const result = await client.rejectChore(choreId, notes);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Completion of chore #${choreId} rejected.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to reject chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 7. Thing history
  server.tool(
    'donetick_get_thing_history',
    'Read the state-change history of a thing (sensor, counter, appliance) — every value it has ' +
      'held and when.',
    {
      thingId: z.number().describe('The ID of the thing'),
    },
    async ({ thingId }) => {
      try {
        const history = await client.getThingHistory(thingId);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ thingId, count: history.length, history }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to get history for thing #${thingId}: ${error.message}` },
          ],
        };
      }
    }
  );
}
