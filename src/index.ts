#!/usr/bin/env node
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { config } from './config.js';
import { DoneTickClient } from './api/donetick-client.js';
import { createDoneTickMcpServer } from './server.js';

interface SessionData {
  transport: SSEServerTransport;
  client: DoneTickClient;
  createdAt: Date;
  keepAliveInterval?: NodeJS.Timeout;
}

const MAX_SESSIONS = 100;
const app = express();

// OWASP A05: Disable X-Powered-By header
app.disable('x-powered-by');

// OWASP A05: Security Headers Middleware
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// CORS configuration
app.use(cors());

// OWASP A04: Limit JSON body size to prevent DoS via payload flooding
app.use(express.json({ limit: '1mb' }));

// Active MCP SSE sessions: sessionId -> SessionData
const sessions = new Map<string, SessionData>();

/**
 * Constant-time string comparison to prevent timing attacks (OWASP A07).
 */
function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Extracts the authentication token from request headers or query params.
 */
function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const secretKey = req.headers['secretkey'] as string | undefined;
  if (secretKey) {
    return secretKey.trim();
  }

  const queryToken = req.query.token as string | undefined;
  if (queryToken) {
    return queryToken.trim();
  }

  return undefined;
}

/**
 * Validates request authentication and returns the DoneTick API token to use.
 */
function authenticateRequest(req: Request): { success: boolean; error?: string; doneTickToken?: string } {
  const providedToken = extractToken(req);

  // If MCP_AUTH_TOKEN is configured, verify that providedToken matches it using timingSafeEqual
  if (config.mcpAuthToken) {
    if (!providedToken || !safeCompare(providedToken, config.mcpAuthToken)) {
      return { success: false, error: 'Unauthorized: Invalid MCP authentication token' };
    }
  }

  // Determine the token to use for DoneTick
  const doneTickToken = config.defaultDonetickToken || providedToken;

  if (!doneTickToken) {
    return {
      success: false,
      error: 'Unauthorized: No DoneTick access token provided. Please provide a Bearer token or configure DONETICK_TOKEN.',
    };
  }

  return { success: true, doneTickToken };
}

// ==================== HEALTH & INFO ====================

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
    donetickUrl: config.donetickUrl,
    hasDefaultToken: !!config.defaultDonetickToken,
    hasMcpAuth: !!config.mcpAuthToken,
  });
});

app.get('/', (_req: Request, res: Response) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>DoneTick MCP Server</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; color: #333; background-color: #f9fafb; }
        .card { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
        h1 { color: #1e40af; margin-top: 0; }
        code { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.95em; }
        pre { background: #1e293b; color: #f8fafc; padding: 16px; border-radius: 6px; overflow-x: auto; }
        .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.85em; }
        .badge-green { background: #dcfce7; color: #166534; }
        ul { padding-left: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>✅ DoneTick MCP Server</h1>
        <p><span class="badge badge-green">Running</span> Model Context Protocol (MCP) HTTP Stream server for DoneTick.</p>
        <p><strong>Target DoneTick:</strong> <code>${config.donetickUrl}</code></p>
      </div>

      <div class="card">
        <h2>🚀 Quick Setup</h2>
        <ol>
          <li>Open your MCP Client (e.g. <strong>Mistral Le Chat</strong>, <strong>Claude Desktop</strong>, or <strong>LibreChat</strong>).</li>
          <li>Add a new MCP server with the SSE URL:
            <pre><code>http://&lt;your-server-host&gt;:${config.port}/sse</code></pre>
          </li>
          <li>Authentication type: <strong>Bearer Token</strong></li>
          <li>Enter your <strong>DoneTick API Key / Access Token</strong>.</li>
        </ol>
      </div>

      <div class="card">
        <h2>🛠️ Available Tools</h2>
        <ul>
          <li><strong>Chores (Tasks):</strong> <code>donetick_list_chores</code>, <code>donetick_get_chore</code>, <code>donetick_create_chore</code>, <code>donetick_update_chore</code>, <code>donetick_set_due_date</code>, etc.</li>
          <li><strong>History:</strong> <code>donetick_get_chore_history</code>, <code>donetick_get_history</code>, <code>donetick_modify_history_entry</code></li>
          <li><strong>Time tracking:</strong> <code>donetick_start_chore</code>, <code>donetick_pause_chore</code>, <code>donetick_get_chore_timer</code></li>
          <li><strong>Subtasks:</strong> <code>donetick_set_subtasks</code>, <code>donetick_add_subtask</code>, <code>donetick_complete_subtask</code>, <code>donetick_remove_subtask</code></li>
          <li><strong>Archive &amp; approval:</strong> <code>donetick_archive_chore</code>, <code>donetick_list_archived_chores</code>, <code>donetick_approve_chore</code></li>
          <li><strong>Projects:</strong> <code>donetick_list_projects</code>, <code>donetick_create_project</code>, <code>donetick_update_project</code>, <code>donetick_delete_project</code></li>
          <li><strong>Things (Devices/Counters):</strong> <code>donetick_list_things</code>, <code>donetick_create_thing</code>, <code>donetick_set_thing_state</code>, etc.</li>
          <li><strong>Labels (Tags):</strong> <code>donetick_list_labels</code>, <code>donetick_set_chore_labels</code>, <code>donetick_add_chore_label</code></li>
          <li><strong>Circles & Filters:</strong> <code>donetick_get_circle_info</code>, <code>donetick_list_members</code>, <code>donetick_list_filters</code></li>
        </ul>
      </div>
    </body>
    </html>
  `);
});

// ==================== SSE TRANSPORT ====================

const handleSseConnection = async (req: Request, res: Response) => {
  const auth = authenticateRequest(req);
  if (!auth.success || !auth.doneTickToken) {
    res.status(401).json({ error: auth.error });
    return;
  }

  // OWASP A04: Session cap check
  if (sessions.size >= MAX_SESSIONS) {
    res.status(503).json({ error: 'Server busy: Maximum active MCP sessions reached' });
    return;
  }

  console.log(`[SSE] New client connection from ${req.ip}`);

  // Base path for messages endpoint
  const messagesEndpoint = req.baseUrl ? `${req.baseUrl}/messages` : '/messages';
  const transport = new SSEServerTransport(messagesEndpoint, res);

  const doneTickClient = new DoneTickClient(config.donetickUrl, auth.doneTickToken, {
    timeZone: config.timeZone,
    defaultTime: config.defaultDueTime,
  });
  const mcpServer = createDoneTickMcpServer(doneTickClient);

  try {
    await mcpServer.connect(transport);
    const sessionId = transport.sessionId;

    // Send periodic SSE comments (: keep-alive) every 15 seconds to prevent reverse proxy timeouts
    const keepAliveInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': keep-alive\n\n');
      }
    }, 15000);

    sessions.set(sessionId, {
      transport,
      client: doneTickClient,
      createdAt: new Date(),
      keepAliveInterval,
    });

    console.log(`[SSE] Session initialized: ${sessionId} (Active sessions: ${sessions.size})`);

    req.on('close', () => {
      console.log(`[SSE] Session disconnected: ${sessionId}`);
      clearInterval(keepAliveInterval);
      sessions.delete(sessionId);
    });
  } catch (err) {
    console.error('[SSE] Failed to initialize session:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to initialize MCP session' });
    }
  }
};

app.get('/sse', handleSseConnection);
app.get('/mcp/sse', handleSseConnection);

// ==================== POST MESSAGES ====================

const handlePostMessage = async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;

  if (!sessionId) {
    res.status(400).json({ error: 'Missing sessionId query parameter' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: `Session ${sessionId} not found or expired` });
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res, req.body);
  } catch (err: any) {
    console.error(`[POST] Error handling message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal error handling message' });
    }
  }
};

app.post('/messages', handlePostMessage);
app.post('/mcp/messages', handlePostMessage);

// ==================== START SERVER ====================

let serverInstance: any = null;
if (process.env.NODE_ENV !== 'test') {
  serverInstance = app.listen(config.port, config.host, () => {
    console.log(`====================================================`);
    console.log(` DoneTick MCP HTTP Stream Server`);
    console.log(` Listening on http://${config.host}:${config.port}`);
    console.log(` SSE Endpoint: http://${config.host}:${config.port}/sse`);
    console.log(` Target DoneTick: ${config.donetickUrl}`);
    console.log(`====================================================`);
  });
}

export { app, extractToken, authenticateRequest, safeCompare, sessions, serverInstance };
