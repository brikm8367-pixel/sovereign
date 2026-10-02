import { describe, it, expect } from 'vitest';
import { AgentEngine } from '../src/agent/index.js';
import { ToolRegistry } from '../src/agent/toolRegistry.js';

describe('Agent integration', () => {
  it('creates a task and plan for a browser request', async () => {
    const engine = new AgentEngine();
    const result = await engine.handleRequest('Open Chrome and search for the best CapCut transitions');

    expect(result.task.title).toContain('Open Chrome');
    expect(result.intent.requiresBrowser).toBe(true);
    expect(result.availableTools).toContain('browser.search');
  });

  it('plans general-purpose computer tasks with tool suggestions', async () => {
    const engine = new AgentEngine();
    const result = await engine.handleRequest('Open Chrome and search for CapCut, then analyze the results on screen.');

    expect(result.toolSuggestions).toEqual(expect.arrayContaining(['browser.search', 'browser.open', 'computer.vision.analyze']));
    expect(result.executionPlan.length).toBeGreaterThan(0);
    expect(result.requiresConfirmation).toBe(false);
  });

  it('registers and validates tool definitions', () => {
    const tool = ToolRegistry.get('browser.search');
    expect(tool).toBeTruthy();
    const valid = ToolRegistry.validateToolCall({
      name: 'browser.search',
      description: 'Search the web',
      input: { query: 'AI tools', engine: 'google' },
      permissions: ['BROWSER', 'INTERNET']
    });
    expect(valid.query).toBe('AI tools');
  });

  it('executes a real app launch tool when the user asks to open an application', async () => {
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: 'ok', pid: 123, environment: 'windows', hostname: 'localhost', uptimeMs: 1000, startedAt: new Date().toISOString(), allowlist: ['Discord'] }));
        return;
      }

      if (req.method === 'POST' && req.url === '/execute') {
        const auth = req.headers.authorization;
        const chunks: Buffer[] = [];

        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (auth !== 'Bearer secret-token') {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, message: 'invalid token' }));
            return;
          }

          expect(body.command.type).toBe('openApplication');
          expect(body.command.appName).toBe('discord');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, status: 'completed', command: body.command, result: { executed: true }, message: 'Command executed successfully.' }));
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'not found' }));
    });

    await new Promise<void>((resolve) => server.listen(40124, '127.0.0.1', resolve));

    const prevUrl = process.env.LOCAL_AGENT_URL;
    const prevToken = process.env.LOCAL_AGENT_TOKEN;
    process.env.LOCAL_AGENT_URL = 'http://127.0.0.1:40124';
    process.env.LOCAL_AGENT_TOKEN = 'secret-token';

    try {
      const engine = new AgentEngine();
      const result = await engine.handleRequest('Open Discord');

      expect(result.executedTools).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: 'computer.openApplication' })
      ]));
      expect(result.executionSummary).toContain('discord');
    } finally {
      if (prevUrl === undefined) delete process.env.LOCAL_AGENT_URL; else process.env.LOCAL_AGENT_URL = prevUrl;
      if (prevToken === undefined) delete process.env.LOCAL_AGENT_TOKEN; else process.env.LOCAL_AGENT_TOKEN = prevToken;
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
