import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, safeCompare, authenticateRequest } from '../src/index.js';
import { config } from '../src/config.js';

describe('OWASP Security Controls & Hardening', () => {
  describe('OWASP A05: Security Headers & Misconfiguration', () => {
    it('should include required security headers on responses', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-xss-protection']).toBe('0');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
    });

    it('should NOT leak X-Powered-By header (fingerprinting protection)', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('OWASP A02: Sensitive Data Exposure', () => {
    it('/health endpoint should never expose raw tokens or credentials', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.hasDefaultToken).toBeDefined();
      expect(typeof res.body.hasDefaultToken).toBe('boolean');
      expect(res.body.hasMcpAuth).toBeDefined();
      expect(typeof res.body.hasMcpAuth).toBe('boolean');
      expect(res.body.token).toBeUndefined();
      expect(res.body.secretKey).toBeUndefined();
      expect(res.body.apiKey).toBeUndefined();
      expect(res.body.password).toBeUndefined();
    });
  });

  describe('OWASP A07: Authentication & Timing Attacks Prevention', () => {
    it('safeCompare should accurately and safely compare strings of identical and different lengths', () => {
      expect(safeCompare('secure-token-123', 'secure-token-123')).toBe(true);
      expect(safeCompare('secure-token-123', 'wrong-token-999')).toBe(false);
      expect(safeCompare('short', 'much-longer-string')).toBe(false);
      expect(safeCompare(null as any, 'test')).toBe(false);
      expect(safeCompare('test', undefined as any)).toBe(false);
    });

    it('authenticateRequest should reject requests when MCP_AUTH_TOKEN is invalid', () => {
      const origMcpAuth = config.mcpAuthToken;
      config.mcpAuthToken = 'strict-mcp-secret';

      const reqWithWrongToken: any = { headers: { authorization: 'Bearer wrong-token' }, query: {} };
      const authWrong = authenticateRequest(reqWithWrongToken);
      expect(authWrong.success).toBe(false);
      expect(authWrong.error).toContain('Invalid MCP authentication token');

      const reqWithRightToken: any = { headers: { authorization: 'Bearer strict-mcp-secret' }, query: {} };
      const authRight = authenticateRequest(reqWithRightToken);
      expect(authRight.success).toBe(true);

      config.mcpAuthToken = origMcpAuth;
    });

    it('authenticateRequest should reject requests when no DoneTick token is available', () => {
      const origDefault = config.defaultDonetickToken;
      const origMcpAuth = config.mcpAuthToken;
      config.defaultDonetickToken = undefined;
      config.mcpAuthToken = undefined;

      const reqEmpty: any = { headers: {}, query: {} };
      const auth = authenticateRequest(reqEmpty);
      expect(auth.success).toBe(false);
      expect(auth.error).toContain('No DoneTick access token provided');

      config.defaultDonetickToken = origDefault;
      config.mcpAuthToken = origMcpAuth;
    });
  });

  describe('OWASP A04: Denial of Service (Payload Size Cap)', () => {
    it('POST /messages should reject payload larger than 1MB with HTTP 413 Payload Too Large', async () => {
      const largePayload = { data: 'x'.repeat(1024 * 1024 + 50) };
      const res = await request(app)
        .post('/messages?sessionId=dummy-session')
        .send(largePayload)
        .set('Content-Type', 'application/json');

      expect(res.status).toBe(413);
    });
  });
});
