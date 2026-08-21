import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('Config module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load default configuration values', async () => {
    delete process.env.PORT;
    delete process.env.HOST;
    delete process.env.DONETICK_URL;
    delete process.env.DONETICK_TOKEN;
    delete process.env.API_KEY;
    delete process.env.ACCESS_TOKEN;
    delete process.env.MCP_AUTH_TOKEN;
    delete process.env.LOG_LEVEL;

    const { config } = await import('../src/config.js');
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.donetickUrl).toBe('http://localhost:2021');
    expect(config.defaultDonetickToken).toBeUndefined();
    expect(config.mcpAuthToken).toBeUndefined();
    expect(config.logLevel).toBe('info');
  });

  it('should load custom environment variables and trim trailing slashes', async () => {
    process.env.PORT = '4000';
    process.env.HOST = '127.0.0.1';
    process.env.DONETICK_URL = 'http://donetick.local:2021///';
    process.env.DONETICK_TOKEN = 'custom-token-123';
    process.env.MCP_AUTH_TOKEN = 'mcp-secret-key';
    process.env.LOG_LEVEL = 'debug';

    const { config } = await import('../src/config.js');
    expect(config.port).toBe(4000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.donetickUrl).toBe('http://donetick.local:2021');
    expect(config.defaultDonetickToken).toBe('custom-token-123');
    expect(config.mcpAuthToken).toBe('mcp-secret-key');
    expect(config.logLevel).toBe('debug');
  });

  it('should sanitize invalid SSRF protocols and fallback to default URL', async () => {
    process.env.DONETICK_URL = 'file:///etc/passwd';
    const { config } = await import('../src/config.js');
    expect(config.donetickUrl).toBe('http://localhost:2021');
  });

  it('should accept API_KEY as fallback for defaultDonetickToken', async () => {
    delete process.env.DONETICK_TOKEN;
    process.env.API_KEY = 'api-key-test';

    const { config } = await import('../src/config.js');
    expect(config.defaultDonetickToken).toBe('api-key-test');
  });

  it('should accept ACCESS_TOKEN as fallback for defaultDonetickToken', async () => {
    delete process.env.DONETICK_TOKEN;
    delete process.env.API_KEY;
    process.env.ACCESS_TOKEN = 'access-token-test';

    const { config } = await import('../src/config.js');
    expect(config.defaultDonetickToken).toBe('access-token-test');
  });
});
