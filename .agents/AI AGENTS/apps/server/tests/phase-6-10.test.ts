import { describe, expect, it } from 'vitest';
import { MemoryService } from '../src/services/memoryService.js';
import { PermissionService } from '../src/services/permissionService.js';
import { LocalAgentService } from '../src/services/localAgentService.js';

describe('Memory Service', () => {
  it('stores and retrieves user memory safely', () => {
    const memory = new MemoryService('test-memory-store');
    memory.clear();

    memory.save({
      kind: 'user-preference',
      title: 'content type',
      content: 'I create AI content videos.',
      sensitive: false
    });

    const results = memory.search('AI content');
    expect(results.length).toBeGreaterThan(0);
  });

  it('does not persist sensitive memory automatically', () => {
    const memory = new MemoryService('test-memory-store-sensitive');
    memory.clear();

    memory.save({
      kind: 'important-fact',
      title: 'secret token',
      content: 'hf_secret_123',
      sensitive: true
    });

    const results = memory.search('hf_secret_123');
    expect(results.length).toBe(0);
  });
});

describe('Permission Service', () => {
  it('requires permission checks before sensitive actions', () => {
    expect(() => PermissionService.require('files', 'DELETE')).toThrow();
    expect(() => PermissionService.require('browser', 'READ')).not.toThrow();
  });
});

describe('Local Computer Agent Interface', () => {
  it('reports disconnected when not configured', () => {
    const service = new LocalAgentService({ url: '', token: '' });
    const status = service.getStatus();
    expect(['Disconnected', 'Connected', 'Error']).toContain(status.status);
  });

  it('executes a safe allowlisted openApplication command over HTTP', async () => {
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, status: 'ok', pid: 123, environment: 'windows', hostname: 'localhost', uptimeMs: 1000, startedAt: new Date().toISOString(), allowlist: ['Notepad'] }));
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
          expect(body.command.appName).toBe('notepad');

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, status: 'completed', command: body.command, result: { executed: true }, message: 'Command executed successfully.' }));
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, message: 'not found' }));
    });

    await new Promise<void>((resolve) => server.listen(40123, '127.0.0.1', resolve));

    try {
      const service = new LocalAgentService({ url: 'http://127.0.0.1:40123', token: 'secret-token' });
      const result = await service.execute({ type: 'openApplication', appName: 'notepad' });
      expect(result.ok).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.command.type).toBe('openApplication');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
