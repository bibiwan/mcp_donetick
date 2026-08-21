import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  donetickUrl: string;
  defaultDonetickToken?: string;
  mcpAuthToken?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function sanitizeUrl(rawUrl?: string): string {
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
};
