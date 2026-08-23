/**
 * Date normalization helpers.
 *
 * DoneTick binds every date field to a Go `*time.Time`, which only accepts
 * RFC3339 (`2026-08-30T18:00:00Z`). Anything else — most notably the plain
 * `YYYY-MM-DD` that language models produce constantly — is rejected by
 * `ShouldBindJSON` with an opaque HTTP 400. These helpers accept the loose
 * formats and emit strict RFC3339.
 */

/** Values a caller can use to explicitly clear a date. */
const CLEAR_TOKENS = new Set(['', 'none', 'null', 'clear', 'remove', 'never']);

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
const HAS_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const TIME_OF_DAY = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export interface DateOptions {
  /** Time of day applied to date-only inputs, as `HH:mm` or `HH:mm:ss`. */
  defaultTime?: string;
  /** IANA zone used to interpret inputs that carry no explicit offset. */
  timeZone?: string;
}

/**
 * Converts an instant expressed as wall-clock components in `timeZone` into
 * the matching UTC epoch. Runs two passes so that instants near a DST
 * transition resolve against the offset actually in effect at that moment
 * rather than the offset of the naive guess.
 */
function zonedWallClockToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);

  const offsetAt = (epoch: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(epoch));

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    // `hour12: false` renders midnight as 24 in some ICU versions.
    const h = get('hour') % 24;
    const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), h, get('minute'), get('second'));
    return asIfUtc - epoch;
  };

  let epoch = naive - offsetAt(naive);
  epoch = naive - offsetAt(epoch);
  return epoch;
}

function parseTimeOfDay(raw: string): { hour: number; minute: number; second: number } {
  const match = TIME_OF_DAY.exec(raw.trim());
  if (!match) {
    return { hour: 18, minute: 0, second: 0 };
  }
  return {
    hour: Math.min(23, Number(match[1])),
    minute: Math.min(59, Number(match[2])),
    second: Math.min(59, Number(match[3] ?? '0')),
  };
}

/**
 * Normalizes a loosely formatted date into RFC3339, or `null` when the caller
 * asked to clear the field.
 *
 * Accepted inputs:
 *  - `null` / `undefined` / one of {@link CLEAR_TOKENS} -> `null`
 *  - RFC3339 with an explicit offset -> normalized to UTC, unchanged in value
 *  - `YYYY-MM-DD` -> `defaultTime` on that day, in `timeZone`
 *  - `YYYY-MM-DD HH:mm[:ss]` / `YYYY-MM-DDTHH:mm[:ss]` -> that wall clock, in `timeZone`
 *
 * @throws Error with an actionable message when the input cannot be parsed.
 */
export function toRfc3339(value: string | null | undefined, options: DateOptions = {}): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (CLEAR_TOKENS.has(raw.toLowerCase())) {
    return null;
  }

  const timeZone = options.timeZone || 'UTC';

  const dateOnly = DATE_ONLY.exec(raw);
  if (dateOnly) {
    const { hour, minute, second } = parseTimeOfDay(options.defaultTime ?? '18:00');
    const epoch = zonedWallClockToUtc(
      Number(dateOnly[1]),
      Number(dateOnly[2]),
      Number(dateOnly[3]),
      hour,
      minute,
      second,
      timeZone
    );
    return new Date(epoch).toISOString();
  }

  if (!HAS_ZONE.test(raw)) {
    const local = LOCAL_DATETIME.exec(raw);
    if (local) {
      const epoch = zonedWallClockToUtc(
        Number(local[1]),
        Number(local[2]),
        Number(local[3]),
        Number(local[4]),
        Number(local[5]),
        Number(local[6] ?? '0'),
        timeZone
      );
      return new Date(epoch).toISOString();
    }
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid date '${raw}'. DoneTick requires RFC3339 (2026-08-30T18:00:00Z); ` +
        `'YYYY-MM-DD' and 'YYYY-MM-DD HH:mm' are also accepted and resolved in ${timeZone}.`
    );
  }
  return parsed.toISOString();
}

/**
 * Same as {@link toRfc3339} but never returns `null` — for fields where
 * DoneTick has no "clear" semantics.
 */
export function requireRfc3339(value: string, options: DateOptions = {}): string {
  const normalized = toRfc3339(value, options);
  if (normalized === null) {
    throw new Error(`A date is required here, but '${value}' was interpreted as "clear".`);
  }
  return normalized;
}

/** Current instant as RFC3339, for optimistic-concurrency payloads. */
export function nowRfc3339(): string {
  return new Date().toISOString();
}
