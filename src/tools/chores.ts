import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';

export function registerChoreTools(server: McpServer, client: DoneTickClient) {
  // 1. List Chores
  server.tool(
    'donetick_list_chores',
    'List all chores/tasks from DoneTick. Supports filtering by subtasks, search text, status, and project ID.',
    {
      includeSubtasks: z.boolean().optional().describe('Whether to include subtasks details (default: false)'),
      search: z.string().optional().describe('Filter chores by matching text in name or description'),
      projectId: z.number().optional().describe('Filter chores by a specific project ID'),
      status: z.number().optional().describe('Filter chores by status code (e.g. 0 for active)'),
    },
    async (args) => {
      try {
        const chores = await client.listChores(args);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: chores.length, chores }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list chores: ${error.message}` }],
        };
      }
    }
  );

  // 2. Get Chore
  server.tool(
    'donetick_get_chore',
    'Retrieve complete details of a specific chore by its ID (including assignees, subtasks, recurrence, and labels).',
    {
      choreId: z.number().describe('The ID of the chore to retrieve'),
    },
    async ({ choreId }) => {
      try {
        const chore = await client.getChore(choreId);
        return {
          content: [{ type: 'text', text: JSON.stringify(chore, null, 2) }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to get chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 3. Create Chore
  server.tool(
    'donetick_create_chore',
    'Create a new chore/task in DoneTick.',
    {
      name: z.string().describe('The name/title of the chore (required)'),
      description: z.string().optional().describe('Detailed description or markdown notes for the chore'),
      dueDate: z.string().optional().describe('Due date in RFC3339 format (e.g. 2026-08-30T19:00:00Z) or YYYY-MM-DD (e.g. 2026-08-30)'),
      frequencyType: z
        .enum([
          'once',
          'daily',
          'weekly',
          'monthly',
          'yearly',
          'adaptive',
          'interval',
          'days_of_the_week',
          'day_of_the_month',
          'trigger',
          'no_repeat',
        ])
        .optional()
        .describe('Recurrence type (default: once)'),
      frequency: z.number().optional().describe('Frequency interval (e.g. every 1 day/week/month)'),
      priority: z.number().min(0).max(5).optional().describe('Priority level (0 = lowest, 5 = highest)'),
      points: z.number().min(0).optional().describe('Points earned upon completing this chore'),
      projectId: z.number().optional().describe('ID of the project this chore belongs to'),
      assignedTo: z.number().optional().describe('User ID to assign the chore to'),
      assignStrategy: z
        .enum([
          'no_assignee',
          'least_assigned',
          'least_completed',
          'random',
          'keep_last_assigned',
          'random_except_last_assigned',
          'round_robin',
        ])
        .optional()
        .describe('Assignment strategy (default: no_assignee)'),
      isRolling: z.boolean().optional().describe('Whether the chore rolls over if overdue'),
      isPrivate: z.boolean().optional().describe('Whether the chore is private to the creator (default: false)'),
      notification: z.boolean().optional().describe('Enable or disable reminders/notifications for this chore'),
      notificationMetadata: z
        .object({
          dueDate: z.boolean().optional().describe('Notify on due date'),
          completion: z.boolean().optional().describe('Notify when completed'),
          nagging: z.boolean().optional().describe('Send repeated nagging reminders if overdue'),
          predue: z.boolean().optional().describe('Notify before due date'),
        })
        .optional()
        .describe('Notification settings'),
      labels: z
        .array(
          z.union([
            z.number().describe('Label ID'),
            z.object({
              id: z.number().optional().describe('Label ID'),
              name: z.string().optional().describe('Label name'),
              color: z.string().optional().describe('Label color'),
            }),
          ])
        )
        .optional()
        .describe('List of labels/tags to attach to this chore'),
      thingId: z.number().optional().describe('ID of a Thing (sensor/appliance/counter) to link as automatic trigger for this chore'),
      triggerValue: z.string().optional().describe('State or threshold value of the Thing that triggers the chore (e.g. "true", "full", "50")'),
      triggerCondition: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']).optional().describe('Trigger condition operator (default: eq)'),
      subTasks: z
        .array(
          z.object({
            name: z.string().describe('Subtask title'),
            order: z.number().optional().describe('Order sequence'),
          })
        )
        .optional()
        .describe('List of subtasks for this chore'),
    },
    async (args) => {
      try {
        const payload: any = { ...args };
        if (args.labels) {
          const allLabels = await client.listLabels().catch(() => []);
          payload.labelsV2 = args.labels
            .map((l: any) => {
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
            .filter((l: any) => l.id > 0);
        }
        if (args.thingId) {
          payload.frequencyType = 'trigger';
          payload.thingTrigger = {
            thingID: args.thingId,
            triggerState: args.triggerValue ?? 'true',
            condition: args.triggerCondition || 'eq',
          };
        }
        const created = await client.createChore(payload);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Chore created successfully:\n${JSON.stringify(created, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to create chore: ${error.message}` }],
        };
      }
    }
  );

  // 4. Update Chore
  server.tool(
    'donetick_update_chore',
    'Update fields of an existing chore in DoneTick. Supports partial updates (e.g. changing only project, name, notifications, labels, thing link, or priority).',
    {
      id: z.number().describe('The ID of the chore to update'),
      name: z.string().optional().describe('New name/title of the chore'),
      description: z.string().optional().describe('New description'),
      nextDueDate: z.string().optional().describe('New next due date (RFC3339 or YYYY-MM-DD)'),
      frequencyType: z
        .enum([
          'once',
          'daily',
          'weekly',
          'monthly',
          'yearly',
          'adaptive',
          'interval',
          'days_of_the_week',
          'day_of_the_month',
          'trigger',
          'no_repeat',
        ])
        .optional()
        .describe('Recurrence type'),
      frequency: z.number().optional().describe('Frequency interval number'),
      priority: z.number().min(0).max(5).optional().describe('Priority level (0-5)'),
      points: z.number().min(0).optional().describe('Points earned'),
      projectId: z.number().optional().describe('ID of the project to attach this chore to (or 0 to detach)'),
      assignedTo: z.number().optional().describe('User ID assigned'),
      assignStrategy: z
        .enum([
          'no_assignee',
          'least_assigned',
          'least_completed',
          'random',
          'keep_last_assigned',
          'random_except_last_assigned',
          'round_robin',
        ])
        .optional()
        .describe('Assignment strategy'),
      isActive: z.boolean().optional().describe('Whether chore is active'),
      isRolling: z.boolean().optional().describe('Whether chore is rolling'),
      isPrivate: z.boolean().optional().describe('Whether chore is private'),
      notification: z.boolean().optional().describe('Enable or disable reminders/notifications for this chore'),
      notificationMetadata: z
        .object({
          dueDate: z.boolean().optional().describe('Notify on due date'),
          completion: z.boolean().optional().describe('Notify when completed'),
          nagging: z.boolean().optional().describe('Send repeated nagging reminders if overdue'),
          predue: z.boolean().optional().describe('Notify before due date'),
        })
        .optional()
        .describe('Notification settings'),
      labels: z
        .array(
          z.union([
            z.number().describe('Label ID'),
            z.object({
              id: z.number().optional().describe('Label ID'),
              name: z.string().optional().describe('Label name'),
              color: z.string().optional().describe('Label color'),
            }),
          ])
        )
        .optional()
        .describe('List of labels/tags to attach to this chore (replaces existing labels)'),
      thingId: z.number().optional().describe('ID of a Thing (sensor/appliance/counter) to link as automatic trigger (or 0 to unlink/detach)'),
      triggerValue: z.string().optional().describe('State or threshold value of the Thing that triggers the chore (e.g. "true", "full", "50")'),
      triggerCondition: z.enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte']).optional().describe('Trigger condition operator (default: eq)'),
      subTasks: z
        .array(
          z.object({
            id: z.number().optional().describe('Subtask ID (if updating an existing subtask)'),
            name: z.string().describe('Subtask title/name'),
            order: z.number().optional().describe('Order sequence'),
            completed: z.boolean().optional().describe('Whether the subtask is completed'),
          })
        )
        .optional()
        .describe('List of subtasks for this chore (replaces or updates subtasks)'),
    },
    async (args) => {
      try {
        const payload: any = { ...args };
        if (args.labels) {
          const allLabels = await client.listLabels().catch(() => []);
          payload.labelsV2 = args.labels
            .map((l: any) => {
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
            .filter((l: any) => l.id > 0);
        }
        if (args.thingId !== undefined) {
          if (args.thingId === 0) {
            payload.thingTrigger = undefined;
          } else {
            payload.frequencyType = 'trigger';
            payload.thingTrigger = {
              thingID: args.thingId,
              triggerState: args.triggerValue ?? 'true',
              condition: args.triggerCondition || 'eq',
            };
          }
        }
        const updated = await client.updateChore(payload);
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${args.id} updated successfully:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to update chore #${args.id}: ${error.message}` }],
        };
      }
    }
  );

  // 4b. Set Chore Project
  server.tool(
    'donetick_set_chore_project',
    'Assign or attach a chore to a project in DoneTick (or set projectId to 0 to detach).',
    {
      choreId: z.number().describe('The ID of the chore'),
      projectId: z.number().describe('The ID of the project to attach the chore to (or 0 to detach)'),
    },
    async ({ choreId, projectId }) => {
      try {
        const updated = await client.updateChore({ id: choreId, projectId: projectId === 0 ? undefined : projectId });
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${choreId} attached to project #${projectId} successfully:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to attach chore #${choreId} to project #${projectId}: ${error.message}` }],
        };
      }
    }
  );

  // 4c. Set Chore Notifications
  server.tool(
    'donetick_set_chore_notifications',
    'Configure reminders and notifications for a chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore'),
      enabled: z.boolean().describe('Enable (true) or disable (false) notifications for this chore'),
      dueDate: z.boolean().optional().describe('Notify on due date (default: true if enabled)'),
      nagging: z.boolean().optional().describe('Send recurring nagging reminders if task is overdue'),
      completion: z.boolean().optional().describe('Notify when the chore is completed'),
      predue: z.boolean().optional().describe('Notify before the due date'),
    },
    async ({ choreId, enabled, dueDate, nagging, completion, predue }) => {
      try {
        const notificationMetadata = enabled
          ? {
              dueDate: dueDate !== undefined ? dueDate : true,
              nagging: nagging ?? false,
              completion: completion ?? false,
              predue: predue ?? false,
            }
          : undefined;

        const updated = await client.updateChore({
          id: choreId,
          notification: enabled,
          notificationMetadata,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Chore #${choreId} notifications configured (enabled: ${enabled}):\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to configure notifications for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 4d. Link Thing to Chore (Sensor / Event Trigger)
  const linkThingHandler = async ({ choreId, thingId, triggerValue, triggerState, condition }: any) => {
    try {
      const stateVal = triggerValue ?? triggerState ?? 'true';
      const cond = condition || 'eq';
      const updated = await client.updateChore({
        id: choreId,
        frequencyType: 'trigger',
        thingTrigger: {
          thingID: thingId,
          triggerState: stateVal,
          condition: cond,
        },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Chore #${choreId} linked to Thing #${thingId} (triggers when state ${cond} '${stateVal}'):\n${JSON.stringify(updated, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Failed to link thing #${thingId} to chore #${choreId}: ${error.message}` }],
      };
    }
  };

  server.tool(
    'donetick_link_thing_to_chore',
    'Link a thing (smart sensor / counter / appliance) to a chore so the chore automatically triggers when the thing reaches a specific state.',
    {
      choreId: z.number().describe('The ID of the chore/task to trigger'),
      thingId: z.number().describe('The ID of the thing/sensor to monitor'),
      triggerValue: z.string().optional().describe("The state or value that triggers the chore (e.g. 'full', 'dirty', '50', 'true')"),
      triggerState: z.string().optional().describe("Alias for triggerValue (e.g. 'full', '50', 'true')"),
      condition: z
        .enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte'])
        .optional()
        .describe("Condition operator: 'eq' (equal, default), 'neq' (not equal), 'gt' (>), 'lt' (<), 'gte' (>=), 'lte' (<=)"),
    },
    linkThingHandler
  );

  server.tool(
    'donetick_link_thing_chore',
    'Alias for donetick_link_thing_to_chore. Link a thing to a chore.',
    {
      choreId: z.number().describe('The ID of the chore/task to trigger'),
      thingId: z.number().describe('The ID of the thing/sensor to monitor'),
      triggerValue: z.string().optional().describe("The state or value that triggers the chore (e.g. 'full', 'dirty', '50', 'true')"),
      triggerState: z.string().optional().describe("Alias for triggerValue"),
      condition: z
        .enum(['eq', 'neq', 'gt', 'lt', 'gte', 'lte'])
        .optional()
        .describe("Condition operator: 'eq' (equal, default), 'neq' (not equal), 'gt' (>), 'lt' (<), 'gte' (>=), 'lte' (<=)"),
    },
    linkThingHandler
  );

  // 4d-2. Unlink Thing from Chore
  const unlinkThingHandler = async ({ choreId }: { choreId: number }) => {
    try {
      const updated = await client.updateChore({
        id: choreId,
        frequencyType: 'once',
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Chore #${choreId} unlinked from Thing successfully:\n${JSON.stringify(updated, null, 2)}`,
          },
        ],
      };
    } catch (error: any) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Failed to unlink thing from chore #${choreId}: ${error.message}` }],
      };
    }
  };

  server.tool(
    'donetick_unlink_thing_from_chore',
    'Unlink/detach a Thing (sensor/device) from a chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore to unlink from the thing'),
    },
    unlinkThingHandler
  );

  server.tool(
    'donetick_unlink_thing_chore',
    'Alias for donetick_unlink_thing_from_chore. Unlink a Thing from a chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore to unlink from the thing'),
    },
    unlinkThingHandler
  );

  // 4e. Set Subtasks
  server.tool(
    'donetick_set_subtasks',
    'Set or replace the list of subtasks for a chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore'),
      subtasks: z
        .array(
          z.union([
            z.string().describe('Subtask title string (e.g. "Nettoyer les buses")'),
            z.object({
              id: z.number().optional().describe('Existing subtask ID'),
              name: z.string().describe('Subtask name'),
              order: z.number().optional().describe('Order index'),
            }),
          ])
        )
        .describe('List of subtasks (strings or objects)'),
    },
    async ({ choreId, subtasks }) => {
      try {
        const formatted = subtasks.map((st, idx) => {
          if (typeof st === 'string') {
            return { name: st, order: idx };
          }
          return { ...st, order: st.order ?? idx };
        });

        const updated = await client.updateChore({
          id: choreId,
          subTasks: formatted as any,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Subtasks updated for Chore #${choreId}:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to set subtasks for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 4f. Add Subtask
  server.tool(
    'donetick_add_subtask',
    'Add a single new subtask to an existing chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore'),
      title: z.string().describe('Title / name of the new subtask'),
    },
    async ({ choreId, title }) => {
      try {
        const chore = await client.getChore(choreId);
        const existing = ((chore as any).subTasks || []).map((st: any) => ({
          id: st.id,
          name: st.name,
          order: st.orderId ?? st.order ?? 0,
        }));
        existing.push({ name: title, order: existing.length });

        const updated = await client.updateChore({
          id: choreId,
          subTasks: existing,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Subtask '${title}' added to Chore #${choreId}:\n${JSON.stringify(updated, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to add subtask to chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 5. Complete Chore
  server.tool(
    'donetick_complete_chore',
    'Mark a chore as completed in DoneTick (schedules next occurrence for recurring chores).',
    {
      choreId: z.number().describe('The ID of the chore to complete'),
      notes: z.string().optional().describe('Optional completion notes or comments'),
      completedTime: z
        .string()
        .optional()
        .describe('Completion timestamp in RFC3339 format (defaults to current time)'),
    },
    async (args) => {
      try {
        const result = await client.completeChore(args);
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${args.choreId} marked as completed.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to complete chore #${args.choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 6. Undo Chore Completion
  server.tool(
    'donetick_undo_chore',
    'Undo the last completion of a chore in DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore to undo completion for'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.undoChore(choreId);
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${choreId} completion undone.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to undo completion for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 7. Delete Chore
  server.tool(
    'donetick_delete_chore',
    'Permanently delete a chore from DoneTick.',
    {
      choreId: z.number().describe('The ID of the chore to delete'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.deleteChore(choreId);
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${choreId} deleted successfully.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to delete chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 8. Set Due Date
  server.tool(
    'donetick_set_due_date',
    'Set or change the next due date for a specific chore.',
    {
      choreId: z.number().describe('The ID of the chore'),
      dueDate: z.string().describe('Due date in RFC3339 format (e.g. 2026-08-30T12:00:00Z) or YYYY-MM-DD (e.g. 2026-08-30)'),
    },
    async ({ choreId, dueDate }) => {
      try {
        const result = await client.setChoreDueDate(choreId, dueDate);
        return {
          content: [
            {
              type: 'text',
              text: `Due date for chore #${choreId} updated to ${dueDate}.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to set due date for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 9. Set Priority
  server.tool(
    'donetick_set_priority',
    'Set the priority level of a chore (0 = lowest, 5 = highest).',
    {
      choreId: z.number().describe('The ID of the chore'),
      priority: z.number().min(0).max(5).describe('Priority from 0 (lowest) to 5 (highest)'),
    },
    async ({ choreId, priority }) => {
      try {
        const result = await client.setChorePriority(choreId, priority);
        return {
          content: [
            {
              type: 'text',
              text: `Priority for chore #${choreId} set to ${priority}.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to set priority for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 10. Skip Chore
  server.tool(
    'donetick_skip_chore',
    'Skip the current occurrence of a recurring chore and move to the next cycle.',
    {
      choreId: z.number().describe('The ID of the chore to skip'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.skipChore(choreId);
        return {
          content: [
            {
              type: 'text',
              text: `Chore #${choreId} occurrence skipped.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to skip chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 11. Nudge Chore
  server.tool(
    'donetick_nudge_chore',
    'Send a notification nudge/reminder to the assigned user for a chore.',
    {
      choreId: z.number().describe('The ID of the chore to nudge'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.nudgeChore(choreId);
        return {
          content: [
            {
              type: 'text',
              text: `Nudge sent for chore #${choreId}.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to nudge chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );
}
