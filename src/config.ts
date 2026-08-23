import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  donetickUrl: string;
  defaultDonetickToken?: string;
  mcpAuthToken?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** IANA zone used to resolve dates given without an explicit UTC offset. */
  timeZone: string;
  /** Time of day applied to date-only inputs such as `2026-08-30`. */
  defaultDueTime: string;
}

/** Accepts `HH:mm` / `HH:mm:ss`, falling back to 18:00 for anything else. */
export function sanitizeDueTime(raw?: string): string {
  const value = (raw || '').trim();
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(value) ? value : '18:00';
}

/** Verifies the zone is one ICU actually knows, so bad input falls back to UTC. */
export function sanitizeTimeZone(raw?: string): string {
  const value = (raw || '').trim();
  if (!value) {
    return 'UTC';
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

export function sanitizeUrl(rawUrl?: string): string {
  const urlStr = (rawUrl || 'http://localhost:2021').trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(urlStr);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol ${parsed.protocol}. Only http and https are allowed.`);
    }
    return urlStr;
  } catch {
    return 'http://localhost:2021';
  }
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  donetickUrl: sanitizeUrl(process.env.DONETICK_URL),
  defaultDonetickToken:
    process.env.DONETICK_TOKEN ||
    process.env.API_KEY ||
    process.env.ACCESS_TOKEN ||
    undefined,
  mcpAuthToken: process.env.MCP_AUTH_TOKEN || undefined,
  logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  timeZone: sanitizeTimeZone(process.env.DONETICK_TIMEZONE || process.env.TZ),
  defaultDueTime: sanitizeDueTime(process.env.DONETICK_DEFAULT_DUE_TIME),
};
