import { describe, it, expect } from 'vitest';
import { toRfc3339, requireRfc3339, nowRfc3339 } from '../src/utils/dates.js';

describe('date normalization', () => {
  describe('clearing', () => {
    it('maps null and undefined to null', () => {
      expect(toRfc3339(null)).toBeNull();
      expect(toRfc3339(undefined)).toBeNull();
    });

    it('treats the clear tokens as an explicit removal', () => {
      for (const token of ['', 'none', 'null', 'clear', 'remove', 'never']) {
        expect(toRfc3339(token)).toBeNull();
      }
    });

    it('is case- and whitespace-insensitive about them', () => {
      expect(toRfc3339('  NONE  ')).toBeNull();
      expect(toRfc3339('Clear')).toBeNull();
    });
  });

  describe('values that already carry a zone', () => {
    it('passes RFC3339 UTC through, normalized', () => {
      expect(toRfc3339('2026-08-30T18:00:00Z')).toBe('2026-08-30T18:00:00.000Z');
    });

    it('converts an explicit offset to UTC without shifting the instant', () => {
      expect(toRfc3339('2026-08-30T20:00:00+02:00')).toBe('2026-08-30T18:00:00.000Z');
    });

    it('ignores the configured zone when an offset is present', () => {
      expect(toRfc3339('2026-08-30T18:00:00Z', { timeZone: 'Asia/Tokyo' })).toBe(
        '2026-08-30T18:00:00.000Z'
      );
    });
  });

  describe('date-only input', () => {
    it('applies the default time in UTC by default', () => {
      expect(toRfc3339('2026-08-30')).toBe('2026-08-30T18:00:00.000Z');
    });

    it('resolves the default time inside the configured zone', () => {
      // 18:00 Paris in August is UTC+2.
      expect(toRfc3339('2026-08-30', { timeZone: 'Europe/Paris' })).toBe(
        '2026-08-30T16:00:00.000Z'
      );
    });

    it('honours a custom default time', () => {
      expect(toRfc3339('2026-08-30', { defaultTime: '07:30', timeZone: 'Europe/Paris' })).toBe(
        '2026-08-30T05:30:00.000Z'
      );
    });

    it('accepts seconds in the default time', () => {
      expect(toRfc3339('2026-08-30', { defaultTime: '07:30:15' })).toBe(
        '2026-08-30T07:30:15.000Z'
      );
    });

    it('falls back to 18:00 when the default time is malformed', () => {
      expect(toRfc3339('2026-08-30', { defaultTime: 'lunchtime' })).toBe(
        '2026-08-30T18:00:00.000Z'
      );
    });

    it('picks the winter offset for a winter date in the same zone', () => {
      // Paris is UTC+1 in January, so the same wall clock lands an hour later.
      expect(toRfc3339('2026-01-15', { timeZone: 'Europe/Paris' })).toBe(
        '2026-01-15T17:00:00.000Z'
      );
    });
  });

  describe('zone-less date-time input', () => {
    it('accepts the T separator', () => {
      expect(toRfc3339('2026-08-30T09:15', { timeZone: 'Europe/Paris' })).toBe(
        '2026-08-30T07:15:00.000Z'
      );
    });

    it('accepts a space separator', () => {
      expect(toRfc3339('2026-08-30 09:15', { timeZone: 'Europe/Paris' })).toBe(
        '2026-08-30T07:15:00.000Z'
      );
    });

    it('accepts seconds', () => {
      expect(toRfc3339('2026-08-30 09:15:42', { timeZone: 'Europe/Paris' })).toBe(
        '2026-08-30T07:15:42.000Z'
      );
    });

    it('resolves a wall clock across a DST boundary', () => {
      // 2026-03-29 is the spring-forward date in Paris: 03:00 is already UTC+2.
      expect(toRfc3339('2026-03-29 04:00', { timeZone: 'Europe/Paris' })).toBe(
        '2026-03-29T02:00:00.000Z'
      );
      // The day before, the same wall clock is still UTC+1.
      expect(toRfc3339('2026-03-28 04:00', { timeZone: 'Europe/Paris' })).toBe(
        '2026-03-28T03:00:00.000Z'
      );
    });

    it('handles a zone west of UTC', () => {
      expect(toRfc3339('2026-08-30 09:00', { timeZone: 'America/New_York' })).toBe(
        '2026-08-30T13:00:00.000Z'
      );
    });
  });

  describe('unparseable input', () => {
    it('throws with a message naming the accepted formats', () => {
      expect(() => toRfc3339('next tuesday')).toThrow(/RFC3339/);
      expect(() => toRfc3339('next tuesday')).toThrow(/YYYY-MM-DD/);
    });

    it('names the zone it would have used', () => {
      expect(() => toRfc3339('sometime', { timeZone: 'Europe/Paris' })).toThrow(/Europe\/Paris/);
    });

    it('rejects a bare time of day', () => {
      expect(() => toRfc3339('18:00')).toThrow();
    });
  });

  describe('requireRfc3339', () => {
    it('behaves like toRfc3339 for real dates', () => {
      expect(requireRfc3339('2026-08-30T18:00:00Z')).toBe('2026-08-30T18:00:00.000Z');
    });

    it('refuses a value that means "clear"', () => {
      expect(() => requireRfc3339('none')).toThrow(/required/);
      expect(() => requireRfc3339('')).toThrow(/required/);
    });
  });

  describe('nowRfc3339', () => {
    it('returns a parseable instant close to now', () => {
      const parsed = Date.parse(nowRfc3339());
      expect(Number.isNaN(parsed)).toBe(false);
      expect(Math.abs(Date.now() - parsed)).toBeLessThan(5000);
    });
  });
});
