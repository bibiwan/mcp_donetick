import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';
import {
  CHORE_HISTORY_STATUS,
  ChoreHistory,
  AnnotatedChoreHistory,
} from '../types/donetick.js';

/**
 * Turns DoneTick's numeric history status into something a model can reason
 * about. Without this, `status: 6` is indistinguishable from `status: 1` to a
 * consumer, which is exactly why `updatedAt` was reported as unusable.
 */
export function annotate(entry: ChoreHistory, choreName?: string): AnnotatedChoreHistory {
  const statusName =
    CHORE_HISTORY_STATUS[entry.status as keyof typeof CHORE_HISTORY_STATUS] ?? 'unknown';
  return { ...entry, statusName, ...(choreName ? { choreName } : {}) };
}

/** Summary counters computed from a history slice. */
function summarize(entries: AnnotatedChoreHistory[]) {
  const byStatus: Record<string, number> = {};
  for (const entry of entries) {
    const key = entry.statusName ?? 'unknown';
    byStatus[key] = (byStatus[key] ?? 0) + 1;
  }
  const completions = entries.filter((e) => e.status === 1);
  return {
    entryCount: entries.length,
    completedCount: completions.length,
    byStatus,
    lastCompletedAt: completions[0]?.performedAt ?? null,
    lastCompletedBy: completions[0]?.completedBy ?? null,
  };
}

const STATUS_NAMES = [
  'started',
  'completed',
  'skipped',
  'pending_approval',
  'rejected',
  'missed',
  'rescheduled',
] as const;

/** Maps the friendly status names back onto DoneTick's numeric codes. */
function toStatusCodes(names?: string[]): number[] | undefined {
  if (!names?.length) return undefined;
  const codes: number[] = [];
  for (const [code, name] of Object.entries(CHORE_HISTORY_STATUS)) {
    if (names.includes(name)) codes.push(Number(code));
  }
  return codes;
}

export function registerHistoryTools(server: McpServer, client: DoneTickClient) {
  // 1. Completion history of a single chore
  server.tool(
    'donetick_get_chore_history',
    'Get the full activity history of one chore: every completion, skip, reschedule and miss, ' +
      'with who did it and when. Use this to answer "when was this last done" or "how often is ' +
      'this actually completed". Each entry carries a statusName so completions can be told apart ' +
      'from reschedules.',
    {
      choreId: z.number().describe('The ID of the chore'),
      onlyCompletions: z
        .boolean()
        .optional()
        .describe('Keep only real completions, dropping reschedules and skips (default: false)'),
      limit: z.number().min(1).optional().describe('Return at most this many entries, newest first'),
    },
    async ({ choreId, onlyCompletions, limit }) => {
      try {
        const raw = await client.getChoreHistory(choreId);
        let entries = raw.map((e) => annotate(e));
        if (onlyCompletions) {
          entries = entries.filter((e) => e.status === 1);
        }
        const summary = summarize(entries);
        if (limit !== undefined) {
          entries = entries.slice(0, limit);
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ choreId, summary, entries }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to get history for chore #${choreId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 2. Circle-wide history
  server.tool(
    'donetick_get_history',
    'Get the recent activity history across all chores — what was done, when, and by whom. ' +
      'Answers questions like "what did we get done this week". DoneTick looks back a number of ' +
      'days (not a number of rows); since/until narrow that window further.',
    {
      days: z
        .number()
        .min(1)
        .optional()
        .describe('How many days back to look (default: 30). This is DoneTick\'s own window.'),
      includeMembers: z
        .boolean()
        .optional()
        .describe('Include the other circle members\' activity, not just your own (default: false)'),
      since: z
        .string()
        .optional()
        .describe('Keep only entries performed at or after this date (RFC3339 or YYYY-MM-DD)'),
      until: z
        .string()
        .optional()
        .describe('Keep only entries performed at or before this date (RFC3339 or YYYY-MM-DD)'),
      statuses: z
        .array(z.enum(STATUS_NAMES))
        .optional()
        .describe('Keep only these kinds of entries, e.g. ["completed"] to exclude reschedules'),
      onlyCompletions: z
        .boolean()
        .optional()
        .describe('Shorthand for statuses: ["completed"] (default: false)'),
      limit: z.number().min(1).optional().describe('Return at most this many entries'),
    },
    async ({ days, includeMembers, since, until, statuses, onlyCompletions, limit }) => {
      try {
        const wanted = onlyCompletions ? [1] : toStatusCodes(statuses);
        const raw = await client.getChoresHistory({
          days,
          includeMembers,
          since,
          until,
          statuses: wanted,
        });

        // Resolve chore names once so the model does not have to look each up.
        let names = new Map<number, string>();
        try {
          const chores = await client.listChores();
          names = new Map(chores.map((c) => [c.id, c.name]));
        } catch {
          // Names are a nicety; the history itself is what was asked for.
        }

        let entries = raw.map((e) => annotate(e, names.get(e.choreId)));
        const summary = summarize(entries);
        if (limit !== undefined) {
          entries = entries.slice(0, limit);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { window: { days: days ?? 30, since: since ?? null, until: until ?? null }, summary, entries },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to get history: ${error.message}` }],
        };
      }
    }
  );

  // 3. Amend a history entry
  server.tool(
    'donetick_modify_history_entry',
    'Correct one history entry — when it was actually performed, its due date, or its notes. ' +
      'Use this to fix a completion logged at the wrong time.',
    {
      choreId: z.number().describe('The ID of the chore the entry belongs to'),
      historyId: z.number().describe('The ID of the history entry (from donetick_get_chore_history)'),
      performedAt: z.string().optional().describe('New performed-at timestamp (RFC3339 or YYYY-MM-DD)'),
      dueDate: z.string().optional().describe('New due date recorded on the entry'),
      notes: z.string().optional().describe('New notes'),
    },
    async ({ choreId, historyId, performedAt, dueDate, notes }) => {
      try {
        const result = await client.modifyHistoryEntry({ choreId, historyId, performedAt, dueDate, notes });
        return {
          content: [
            {
              type: 'text' as const,
              text: `History entry #${historyId} of chore #${choreId} updated.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to modify history entry #${historyId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 4. Delete a history entry
  server.tool(
    'donetick_delete_history_entry',
    'Permanently delete one history entry, for instance a completion logged by mistake. ' +
      'Prefer donetick_undo_chore to revert the most recent completion.',
    {
      choreId: z.number().describe('The ID of the chore the entry belongs to'),
      historyId: z.number().describe('The ID of the history entry to delete'),
    },
    async ({ choreId, historyId }) => {
      try {
        const result = await client.deleteHistoryEntry(choreId, historyId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `History entry #${historyId} of chore #${choreId} deleted.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to delete history entry #${historyId}: ${error.message}` },
          ],
        };
      }
    }
  );
}
