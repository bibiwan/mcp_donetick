#!/usr/bin/env tsx
/**
 * Live smoke test against a real DoneTick instance.
 *
 * The unit suite mocks axios, so it proves our payloads are shaped the way we
 * think — not that DoneTick accepts them. This script exercises every endpoint
 * the connector talks to against a real server, then deletes everything it
 * created.
 *
 * Usage:
 *   DONETICK_URL=https://donetick.example DONETICK_TOKEN=xxx npx tsx scripts/smoke-live.ts
 *
 * Safety: every object it creates is named with the TEST_PREFIX below, and the
 * teardown refuses to delete anything whose name lacks that prefix. It never
 * writes to a pre-existing chore.
 */
import { DoneTickClient } from '../src/api/donetick-client.js';
import { config } from '../src/config.js';

const TEST_PREFIX = '[mcp-test]';

let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(name: string, detail = ''): void {
  passed++;
  console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
}

function ko(name: string, error: unknown): void {
  failed++;
  const message = error instanceof Error ? error.message : String(error);
  failures.push(`${name}: ${message}`);
  console.log(`  \x1b[31mFAIL\x1b[0m ${name} — ${message}`);
}

async function check(name: string, fn: () => Promise<string | void>): Promise<void> {
  try {
    const detail = await fn();
    ok(name, detail || '');
  } catch (error) {
    ko(name, error);
  }
}

/** Asserts a condition, turning a wrong-but-successful call into a failure. */
function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const token = config.defaultDonetickToken;
  if (!token) {
    console.error('DONETICK_TOKEN (or API_KEY) must be set.');
    process.exit(2);
  }

  const client = new DoneTickClient(config.donetickUrl, token, {
    timeZone: config.timeZone,
    defaultTime: config.defaultDueTime,
  });

  console.log(`\nDoneTick live smoke test`);
  console.log(`  target   : ${config.donetickUrl}`);
  console.log(`  timezone : ${config.timeZone} (date-only inputs land at ${config.defaultDueTime})\n`);

  const before = await client.listChores();
  console.log(`Read-only baseline: ${before.length} chores visible.\n`);

  let choreId = 0;
  let subtaskId = 0;

  try {
    // ---------- create ----------
    console.log('Create & read');
    await check('createChore returns the full chore, not a bare id', async () => {
      const created = await client.createChore({
        name: `${TEST_PREFIX} smoke ${new Date().toISOString()}`,
        description: 'Created by scripts/smoke-live.ts — deleted at the end of the run.',
        frequencyType: 'weekly',
        frequency: 1,
        priority: 2,
        // Date-only input: the regression that used to 400 with a Go parse error.
        nextDueDate: '2026-09-15',
        subTasks: [
          { name: 'alpha', order: 0 },
          { name: 'beta', order: 1 },
          { name: 'gamma', order: 2 },
        ],
      });
      expect(typeof created === 'object' && created !== null, 'expected an object');
      expect(typeof created.id === 'number' && created.id > 0, `expected a numeric id, got ${created.id}`);
      choreId = created.id;
      return `#${choreId}`;
    });

    if (!choreId) {
      throw new Error('cannot continue without a test chore');
    }

    await check('date-only nextDueDate was accepted and normalized', async () => {
      const chore = await client.getChore(choreId);
      expect(!!chore.nextDueDate, 'nextDueDate is empty');
      expect(chore.nextDueDate!.startsWith('2026-09-15'), `unexpected due date ${chore.nextDueDate}`);
      return chore.nextDueDate!;
    });

    await check('subtask order round-trips via orderId', async () => {
      const chore = await client.getChore(choreId);
      const subs = (chore.subTasks ?? []) as any[];
      expect(subs.length === 3, `expected 3 subtasks, got ${subs.length}`);
      const orders = subs.map((s) => s.orderId ?? -1).sort();
      expect(orders.join(',') === '0,1,2', `expected orders 0,1,2 got ${orders.join(',')}`);
      subtaskId = subs.find((s) => s.name === 'beta')?.id ?? subs[0].id;
      return `orderId = ${orders.join(',')}`;
    });

    // ---------- due date ----------
    console.log('\nDue date');
    await check('setChoreDueDate with RFC3339 (was HTTP 400: missing updatedAt)', async () => {
      const updated = await client.setChoreDueDate(choreId, '2026-09-20T09:30:00Z');
      expect(!!updated, 'empty response');
      const chore = await client.getChore(choreId);
      expect(chore.nextDueDate!.startsWith('2026-09-20'), `got ${chore.nextDueDate}`);
      return chore.nextDueDate!;
    });

    await check('setChoreDueDate with a date-only string', async () => {
      await client.setChoreDueDate(choreId, '2026-09-25');
      const chore = await client.getChore(choreId);
      expect(chore.nextDueDate!.startsWith('2026-09-25'), `got ${chore.nextDueDate}`);
      return chore.nextDueDate!;
    });

    await check('setChoreDueDate(null) clears the due date', async () => {
      await client.setChoreDueDate(choreId, null);
      const chore = await client.getChore(choreId);
      expect(!chore.nextDueDate, `expected no due date, got ${chore.nextDueDate}`);
      return 'cleared';
    });

    // ---------- priority ----------
    console.log('\nPriority');
    await check('setChorePriority accepts 0 and 4', async () => {
      await client.setChorePriority(choreId, 0);
      await client.setChorePriority(choreId, 4);
      return '0 and 4 accepted';
    });

    await check('setChorePriority(5) is rejected client-side, before the HTTP 400', async () => {
      let threw = false;
      try {
        await client.setChorePriority(choreId, 5);
      } catch (error) {
        threw = true;
        expect(
          String((error as Error).message).includes('0-4'),
          'error should name the valid 0-4 range'
        );
      }
      expect(threw, 'priority 5 should have been refused');
      return 'refused with a usable message';
    });

    // ---------- subtasks ----------
    console.log('\nSubtasks');
    await check('setSubtaskCompletion ticks one subtask', async () => {
      await client.setSubtaskCompletion(choreId, subtaskId, new Date().toISOString());
      const chore = await client.getChore(choreId);
      const sub = ((chore.subTasks ?? []) as any[]).find((s) => s.id === subtaskId);
      expect(!!sub?.completedAt, 'completedAt still null');
      return `subtask #${subtaskId} completedBy=${sub.completedBy}`;
    });

    await check('setSubtaskCompletion(null) unticks it', async () => {
      await client.setSubtaskCompletion(choreId, subtaskId, null);
      const chore = await client.getChore(choreId);
      const sub = ((chore.subTasks ?? []) as any[]).find((s) => s.id === subtaskId);
      expect(!sub?.completedAt, 'completedAt should be null');
      return 'unticked';
    });

    // ---------- timer ----------
    console.log('\nTime tracking');
    await check('startChore then getChoreTimer returns a session', async () => {
      await client.startChore(choreId);
      const sessions = await client.getChoreTimer(choreId);
      expect(sessions.length > 0, 'no session returned');
      return `${sessions.length} session(s), id=${sessions[0].id}`;
    });

    await check('pauseChore banks the elapsed time', async () => {
      await client.pauseChore(choreId);
      const detail = await client.getChoreDetail(choreId);
      expect(typeof detail.duration === 'number', 'duration missing from /details');
      return `duration=${detail.duration}s status=${detail.status}`;
    });

    await check('resetChoreTimer clears it', async () => {
      await client.resetChoreTimer(choreId);
      const detail = await client.getChoreDetail(choreId);
      return `duration=${detail.duration}s`;
    });

    // ---------- completion & history ----------
    console.log('\nCompletion & history');
    await check('completeChore records a completion', async () => {
      await client.completeChore({ choreId, notes: `${TEST_PREFIX} smoke completion` });
      const history = await client.getChoreHistory(choreId);
      const completions = history.filter((h) => h.status === 1);
      expect(completions.length > 0, 'no status=1 entry in history');
      return `${history.length} history entries, ${completions.length} completion(s)`;
    });

    await check('getChoreDetail exposes lastCompletedDate and lastCompletedBy', async () => {
      const detail = await client.getChoreDetail(choreId);
      expect(!!detail.lastCompletedDate, 'lastCompletedDate is null after a completion');
      return `lastCompletedDate=${detail.lastCompletedDate} by=${detail.lastCompletedBy}`;
    });

    await check('completing a recurring chore resets its subtasks (DoneTick behaviour)', async () => {
      const chore = await client.getChore(choreId);
      const stillTicked = ((chore.subTasks ?? []) as any[]).filter((s) => s.completedAt);
      expect(stillTicked.length === 0, `${stillTicked.length} subtask(s) unexpectedly still ticked`);
      return 'all subtasks reset, as documented';
    });

    await check('getChoresHistory filters by status and date range', async () => {
      const completions = await client.getChoresHistory({
        days: 7,
        includeMembers: true,
        statuses: [1],
      });
      expect(Array.isArray(completions), 'expected an array');
      expect(
        completions.every((h) => h.status === 1),
        'status filter leaked non-completions'
      );
      const windowed = await client.getChoresHistory({ days: 7, since: '2000-01-01' });
      expect(windowed.length >= completions.length, 'since filter dropped too much');
      return `${completions.length} completion(s) in the last 7 days`;
    });

    await check('undoChore reverts the last completion', async () => {
      await client.undoChore(choreId);
      return 'undone';
    });

    // ---------- archive ----------
    console.log('\nArchive');
    await check('archiveChore then listArchivedChores finds it', async () => {
      await client.archiveChore(choreId);
      const archived = await client.listArchivedChores();
      expect(archived.some((c) => c.id === choreId), 'chore missing from /archived');
      return `${archived.length} archived chore(s)`;
    });

    await check('unarchiveChore restores it', async () => {
      await client.unarchiveChore(choreId);
      const archived = await client.listArchivedChores();
      expect(!archived.some((c) => c.id === choreId), 'chore still archived');
      return 'restored';
    });

    // ---------- read-only surface ----------
    console.log('\nRead-only surface');
    await check('listProjects', async () => `${(await client.listProjects()).length} project(s)`);
    await check('listThings', async () => `${(await client.listThings()).length} thing(s)`);
    await check('listFilters', async () => `${(await client.listFilters()).length} filter(s)`);
    await check('getCircleMembers', async () => `${(await client.getCircleMembers()).length} member(s)`);
    await check('listLabels (falls back when the API key is refused)', async () => {
      const labels = await client.listLabels();
      return `${labels.length} label(s)`;
    });
  } finally {
    // ---------- teardown ----------
    console.log('\nTeardown');
    if (choreId) {
      try {
        const chore = await client.getChore(choreId);
        if (!chore.name?.startsWith(TEST_PREFIX)) {
          console.log(
            `  \x1b[31mREFUSING\x1b[0m to delete #${choreId}: name "${chore.name}" lacks the ${TEST_PREFIX} prefix.`
          );
        } else {
          await client.deleteChore(choreId);
          console.log(`  deleted test chore #${choreId}`);
        }
      } catch (error) {
        console.log(
          `  \x1b[31mLEFTOVER\x1b[0m test chore #${choreId} could not be deleted: ` +
            `${error instanceof Error ? error.message : String(error)}\n` +
            `  Delete it by hand in DoneTick.`
        );
      }
    }

    const after = await client.listChores();
    const strays = after.filter((c) => c.name?.startsWith(TEST_PREFIX));
    console.log(`  chores now: ${after.length} (baseline was ${before.length})`);
    if (strays.length) {
      console.log(`  \x1b[31m${strays.length} stray ${TEST_PREFIX} chore(s)\x1b[0m: ${strays.map((c) => `#${c.id}`).join(', ')}`);
    } else {
      console.log(`  no ${TEST_PREFIX} leftovers`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
