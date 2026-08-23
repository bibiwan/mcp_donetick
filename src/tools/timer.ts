import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DoneTickClient } from '../api/donetick-client.js';
import { TIME_SESSION_STATUS, TimeSession } from '../types/donetick.js';

/** Renders seconds as `1h 05m 30s`, dropping empty leading units. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function describeSessions(sessions: TimeSession[]) {
  const total = sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  return {
    sessionCount: sessions.length,
    totalSeconds: total,
    totalHuman: formatDuration(total),
    sessions: sessions.map((s) => ({
      ...s,
      statusName: TIME_SESSION_STATUS[s.status as keyof typeof TIME_SESSION_STATUS] ?? 'unknown',
      durationHuman: formatDuration(s.duration ?? 0),
    })),
  };
}

export function registerTimerTools(server: McpServer, client: DoneTickClient) {
  // 1. Start
  server.tool(
    'donetick_start_chore',
    'Start (or resume) the timer on a chore, marking it in progress. DoneTick tracks the elapsed ' +
      'time per chore; pair with donetick_pause_chore to stop the clock.',
    {
      choreId: z.number().describe('The ID of the chore to start working on'),
    },
    async ({ choreId }) => {
      try {
        const result = await client.startChore(choreId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Timer started on chore #${choreId}.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to start chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 2. Pause
  server.tool(
    'donetick_pause_chore',
    'Pause the timer on a chore, banking the time elapsed since it was started.',
    {
      choreId: z.number().describe('The ID of the chore to pause'),
    },
    async ({ choreId }) => {
      try {
        await client.pauseChore(choreId);
        const detail = await client.getChoreDetail(choreId).catch(() => null);
        const spent = detail?.duration ?? 0;
        return {
          content: [
            {
              type: 'text' as const,
              text:
                `Timer paused on chore #${choreId}. Time logged so far: ${formatDuration(spent)} ` +
                `(${spent}s).`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to pause chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 3. Read
  server.tool(
    'donetick_get_chore_timer',
    'Read the time tracked on a chore: total time spent plus each individual work session with ' +
      'its start, end and pauses. Answers "how long does this task actually take".',
    {
      choreId: z.number().describe('The ID of the chore'),
    },
    async ({ choreId }) => {
      try {
        const sessions = await client.getChoreTimer(choreId);
        const detail = await client.getChoreDetail(choreId).catch(() => null);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  choreId,
                  accumulatedSeconds: detail?.duration ?? null,
                  accumulatedHuman: detail ? formatDuration(detail.duration ?? 0) : null,
                  currentlyRunningSince: detail?.startTime ?? null,
                  ...describeSessions(sessions),
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to read timer for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 4. Reset
  server.tool(
    'donetick_reset_chore_timer',
    'Clear all time tracked on a chore, resetting it to zero.',
    {
      choreId: z.number().describe('The ID of the chore whose timer should be cleared'),
    },
    async ({ choreId }) => {
      try {
        await client.resetChoreTimer(choreId);
        return {
          content: [{ type: 'text' as const, text: `Timer reset to zero on chore #${choreId}.` }],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: 'text' as const, text: `Failed to reset timer for chore #${choreId}: ${error.message}` }],
        };
      }
    }
  );

  // 5. Correct a session
  server.tool(
    'donetick_adjust_time_session',
    'Correct the start or end time of a recorded work session, which changes the duration it ' +
      'contributes. This is the only way to fix time after the fact: DoneTick has no endpoint for ' +
      'setting a duration directly, and completing a chore accepts no time-spent value.',
    {
      choreId: z.number().describe('The ID of the chore'),
      sessionId: z.number().describe('The ID of the session (from donetick_get_chore_timer)'),
      startTime: z.string().optional().describe('New start timestamp (RFC3339 or YYYY-MM-DD HH:mm)'),
      endTime: z.string().optional().describe('New end timestamp (RFC3339 or YYYY-MM-DD HH:mm)'),
    },
    async ({ choreId, sessionId, startTime, endTime }) => {
      try {
        if (startTime === undefined && endTime === undefined) {
          throw new Error('Provide at least one of startTime or endTime.');
        }
        const result = await client.updateTimeSession({ choreId, sessionId, startTime, endTime });
        return {
          content: [
            {
              type: 'text' as const,
              text: `Session #${sessionId} of chore #${choreId} adjusted.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to adjust session #${sessionId}: ${error.message}` },
          ],
        };
      }
    }
  );

  // 6. Delete a session
  server.tool(
    'donetick_delete_time_session',
    'Delete one recorded work session from a chore, removing its time from the total.',
    {
      choreId: z.number().describe('The ID of the chore'),
      sessionId: z.number().describe('The ID of the session to delete'),
    },
    async ({ choreId, sessionId }) => {
      try {
        const result = await client.deleteTimeSession(choreId, sessionId);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Session #${sessionId} of chore #${choreId} deleted.\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [
            { type: 'text' as const, text: `Failed to delete session #${sessionId}: ${error.message}` },
          ],
        };
      }
    }
  );
}
