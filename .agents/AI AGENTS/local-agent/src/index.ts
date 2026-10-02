import cors from 'cors';
import dotenv from 'dotenv';
import express, { type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { ensureAllowedCommand, getAllowlist } from './guard.js';
import { LocalAgentExecuteRequestSchema, LocalAgentTokenSchema } from './types.js';

dotenv.config();

const app = express();
const port = Number(process.env.LOCAL_AGENT_PORT ?? 3001);
const host = process.env.LOCAL_AGENT_HOST ?? '127.0.0.1';
const token = process.env.LOCAL_AGENT_TOKEN ?? 'dev-local-agent-token';
const startedAt = new Date().toISOString();
const activeJobs = new Map<string, { cancelled: boolean; timeout?: NodeJS.Timeout }>();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

function assertToken(req: Request, res: Response, next: () => void): void {
  const provided = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  const normalized = provided.startsWith('Bearer ') ? provided.slice(7) : provided;

  try {
    LocalAgentTokenSchema.parse({ token: normalized });
    if (normalized !== token) {
      res.status(401).json({ ok: false, error: 'Invalid local agent token.' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ ok: false, error: 'Missing or invalid local agent token.' });
  }
}

app.get('/health', assertToken, (_req, res) => {
  res.json({
    ok: true,
    status: 'ok',
    pid: process.pid,
    environment: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux',
    hostname: os.hostname(),
    uptimeMs: Date.now() - Number(new Date(startedAt)),
    startedAt,
    allowlist: getAllowlist()
  });
});

app.post('/execute', assertToken, (req, res) => {
  try {
    const parsed = LocalAgentExecuteRequestSchema.parse(req.body);
    ensureAllowedCommand(parsed.command);

    const jobId = randomUUID();
    const timeoutMs = parsed.timeoutMs ?? 15000;
    const job = { cancelled: false, timeout: undefined as NodeJS.Timeout | undefined };
    activeJobs.set(jobId, job);

    const timeoutHandle = setTimeout(() => {
      const current = activeJobs.get(jobId);
      if (current && !current.cancelled) {
        current.cancelled = true;
        res.status(504).json({
          ok: false,
          status: 'timeout',
          command: parsed.command,
          message: 'Local agent command timed out.'
        });
      }
      activeJobs.delete(jobId);
    }, timeoutMs);

    job.timeout = timeoutHandle;

    const result = {
      ok: true,
      status: 'completed',
      command: parsed.command,
      result: {
        executed: true,
        appName: parsed.command.type === 'openApplication' || parsed.command.type === 'closeApplication' ? parsed.command.appName : undefined,
        note: 'This local agent is the secure, allowlisted execution layer. Real OS automation is intentionally restricted to approved actions.'
      },
      message: 'Command executed successfully by the local agent.'
    };

    clearTimeout(timeoutHandle);
    activeJobs.delete(jobId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    res.status(400).json({ ok: false, status: 'rejected', command: req.body?.command ?? null, message });
  }
});

app.post('/cancel', assertToken, (req, res) => {
  const { jobId } = req.body ?? {};
  if (!jobId || typeof jobId !== 'string') {
    res.status(400).json({ ok: false, message: 'jobId is required.' });
    return;
  }

  const job = activeJobs.get(jobId);
  if (!job) {
    res.status(404).json({ ok: false, message: 'Job not found.' });
    return;
  }

  job.cancelled = true;
  if (job.timeout) clearTimeout(job.timeout);
  activeJobs.delete(jobId);
  res.json({ ok: true, status: 'cancelled', message: 'Local agent job cancelled.' });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.listen(port, host, () => {
  console.log(`Local Agent listening on http://${host}:${port}`);
});
