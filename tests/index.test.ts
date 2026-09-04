import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app, extractToken, authenticateRequest, sessions, streamableSessions } from '../src/index.js';
import { config } from '../src/config.js';

describe('HTTP / SSE Server Endpoints', () => {
  beforeEach(() => {
    sessions.clear();
    streamableSessions.clear();
  });

  describe('extractToken()', () => {
    it('should extract Bearer token from Authorization header', () => {
      const req = { headers: { authorization: 'Bearer secret-bearer-123' }, query: {} } as any;
      expect(extractToken(req)).toBe('secret-bearer-123');
    });

    it('should extract lowercase bearer token from Authorization header', () => {
      const req = { headers: { authorization: 'bearer secret-bearer-456' }, query: {} } as any;
      expect(extractToken(req)).toBe('secret-bearer-456');
    });

    it('should extract token from secretkey header', () => {
      const req = { headers: { secretkey: 'secretkey-token' }, query: {} } as any;
      expect(extractToken(req)).toBe('secretkey-token');
    });

    it('should extract token from query parameter ?token=...', () => {
      const req = { headers: {}, query: { token: 'query-token-789' } } as any;
      expect(extractToken(req)).toBe('query-token-789');
    });

    it('should return undefined if no token is found', () => {
      const req = { headers: {}, query: {} } as any;
      expect(extractToken(req)).toBeUndefined();
    });
  });

  describe('authenticateRequest()', () => {
    it('should reject if MCP_AUTH_TOKEN is configured and token does not match', () => {
      config.mcpAuthToken = 'strict-mcp-key';
      const req = { headers: { authorization: 'Bearer wrong-key' }, query: {} } as any;

      const auth = authenticateRequest(req);
      expect(auth.success).toBe(false);
      expect(auth.error).toContain('Invalid MCP authentication token');
      config.mcpAuthToken = undefined;
    });

    it('should accept if MCP_AUTH_TOKEN is configured and token matches', () => {
      config.mcpAuthToken = 'strict-mcp-key';
      config.defaultDonetickToken = 'donetick-secret';
      const req = { headers: { authorization: 'Bearer strict-mcp-key' }, query: {} } as any;

      const auth = authenticateRequest(req);
      expect(auth.success).toBe(true);
      expect(auth.doneTickToken).toBe('donetick-secret');
      config.mcpAuthToken = undefined;
      config.defaultDonetickToken = undefined;
    });

    it('should use provided Bearer token as DoneTick token when no default is set', () => {
      config.mcpAuthToken = undefined;
      config.defaultDonetickToken = undefined;
      const req = { headers: { authorization: 'Bearer user-token-123' }, query: {} } as any;

      const auth = authenticateRequest(req);
      expect(auth.success).toBe(true);
      expect(auth.doneTickToken).toBe('user-token-123');
    });

    it('should return error when no token is provided anywhere', () => {
      config.mcpAuthToken = undefined;
      config.defaultDonetickToken = undefined;
      const req = { headers: {}, query: {} } as any;

      const auth = authenticateRequest(req);
      expect(auth.success).toBe(false);
      expect(auth.error).toContain('No DoneTick access token provided');
    });
  });

  describe('Endpoints', () => {
    it('GET /health should return 200 with server status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.donetickUrl).toBeDefined();
    });

    it('GET / should return 200 with HTML landing page', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.text).toContain('DoneTick MCP Server');
      expect(res.text).toContain('Mistral Le Chat');
    });

    it('GET /sse and /mcp/sse without token should return 401 Unauthorized', async () => {
      const savedToken = config.defaultDonetickToken;
      config.defaultDonetickToken = undefined;

      const res1 = await request(app).get('/sse');
      expect(res1.status).toBe(401);
      expect(res1.body.error).toBeDefined();

      const res2 = await request(app).get('/mcp/sse');
      expect(res2.status).toBe(401);
      expect(res2.body.error).toBeDefined();

      config.defaultDonetickToken = savedToken;
    });

    it('GET /sse with valid token should initialize SSE stream and register session', async () => {
      const req = request(app)
        .get('/sse')
        .set('Authorization', 'Bearer valid-test-token');

      // Connect and receive initial headers
      const res = await new Promise<any>((resolve) => {
        const stream = req.buffer(false).parse((res, cb) => {
          resolve(res);
          cb(null, '');
        });
        stream.end();
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(sessions.size).toBeGreaterThanOrEqual(0);
    });

    it('POST /messages without sessionId should return 400 Bad Request', async () => {
      const res = await request(app).post('/messages').send({ jsonrpc: '2.0' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing sessionId');
    });

    it('POST /mcp/messages without sessionId should return 400 Bad Request', async () => {
      const res = await request(app).post('/mcp/messages').send({ jsonrpc: '2.0' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing sessionId');
    });

    it('POST /messages with unknown sessionId should return 404 Not Found', async () => {
      const res = await request(app).post('/messages?sessionId=non-existent-session').send({ jsonrpc: '2.0' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or expired');
    });

    it('POST /messages with active session should call transport.handlePostMessage', async () => {
      const mockTransport = {
        handlePostMessage: vi.fn().mockImplementation((_req, res) => {
          res.status(202).send('Accepted');
        }),
      };

      sessions.set('test-session-123', {
        transport: mockTransport as any,
        client: {} as any,
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/messages?sessionId=test-session-123')
        .send({ jsonrpc: '2.0', method: 'ping' });

      expect(mockTransport.handlePostMessage).toHaveBeenCalled();
      expect(res.status).toBe(202);
    });

    it('POST /messages should handle transport errors gracefully', async () => {
      const mockTransport = {
        handlePostMessage: vi.fn().mockRejectedValue(new Error('Transport broken')),
      };

      sessions.set('test-session-err', {
        transport: mockTransport as any,
        client: {} as any,
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/messages?sessionId=test-session-err')
        .send({ jsonrpc: '2.0' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Transport broken');
    });
  });

  describe('Streamable HTTP transport (/mcp)', () => {
    it('POST /mcp without token should return 401 Unauthorized', async () => {
      const savedToken = config.defaultDonetickToken;
      config.defaultDonetickToken = undefined;

      const res = await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', method: 'initialize', id: 1, params: {} });
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();

      config.defaultDonetickToken = savedToken;
    });

    it('POST /mcp without a session ID and a non-initialize request should return 400', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .send({ jsonrpc: '2.0', method: 'ping', id: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No valid session ID');
    });

    it('POST /mcp with an unknown session ID should return 404', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .set('mcp-session-id', 'non-existent-session')
        .send({ jsonrpc: '2.0', method: 'ping', id: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found or expired');
    });

    it('POST /mcp with a valid initialize request should create a session', async () => {
      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .set('Accept', 'application/json, text/event-stream')
        .send({
          jsonrpc: '2.0',
          method: 'initialize',
          id: 1,
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        });

      expect(res.status).toBe(200);
      expect(res.headers['mcp-session-id']).toBeDefined();
      expect(streamableSessions.size).toBe(1);
    });

    it('GET /mcp with an existing session ID should call transport.handleRequest', async () => {
      const mockTransport = {
        handleRequest: vi.fn().mockImplementation((_req, res) => {
          res.status(200).end();
        }),
      };

      streamableSessions.set('test-streamable-session', {
        transport: mockTransport as any,
        client: {} as any,
        createdAt: new Date(),
      });

      const res = await request(app)
        .get('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .set('mcp-session-id', 'test-streamable-session');

      expect(mockTransport.handleRequest).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('DELETE /mcp with an existing session ID should call transport.handleRequest', async () => {
      const mockTransport = {
        handleRequest: vi.fn().mockImplementation((_req, res) => {
          res.status(200).end();
        }),
      };

      streamableSessions.set('test-streamable-session-del', {
        transport: mockTransport as any,
        client: {} as any,
        createdAt: new Date(),
      });

      const res = await request(app)
        .delete('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .set('mcp-session-id', 'test-streamable-session-del');

      expect(mockTransport.handleRequest).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('POST /mcp should handle transport errors gracefully', async () => {
      const mockTransport = {
        handleRequest: vi.fn().mockRejectedValue(new Error('Transport broken')),
      };

      streamableSessions.set('test-streamable-session-err', {
        transport: mockTransport as any,
        client: {} as any,
        createdAt: new Date(),
      });

      const res = await request(app)
        .post('/mcp')
        .set('Authorization', 'Bearer valid-test-token')
        .set('mcp-session-id', 'test-streamable-session-err')
        .send({ jsonrpc: '2.0', method: 'ping', id: 1 });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Transport broken');
    });
  });
});
