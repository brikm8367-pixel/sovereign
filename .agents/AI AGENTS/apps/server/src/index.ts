import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { env } from './config/env.js';
import { Logger } from './services/logger.js';
import { OpenRouterService } from './services/openRouterService.js';
import { AgentEngine } from './agent/index.js';

const app = express();
const port = env.port;
const aiService = new OpenRouterService();
const agentEngine = new AgentEngine();

app.use(cors());
app.use(express.json());

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional()
});

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    name: 'Personal AI Agent',
    aiProvider: aiService.getProvider(),
    aiModel: aiService.getModel(),
    aiConfigured: aiService.isConfigured(),
    timestamp: new Date().toISOString()
  });
});

app.post('/api/chat', async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  try {
    const reply = await aiService.generateResponse([
      { role: 'user', content: parsed.data.message }
    ], 'You are a personal AI assistant. Keep responses concise and helpful.');

    return res.json({
      message: reply,
      conversationId: parsed.data.conversationId ?? 'demo-conversation'
    });
  } catch (error) {
    Logger.error('Chat endpoint failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.post('/api/agent/run', async (req, res) => {
  const { message } = req.body as { message?: string };

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const result = await agentEngine.handleRequest(message);

    return res.json({
      ok: true,
      ...result
    });
  } catch (error) {
    Logger.error('Agent execution failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown agent execution error'
    });
  }
});

app.post('/api/ai/test', async (_req, res) => {
  try {
    const result = aiService.isConfigured()
      ? { status: 'connected', provider: aiService.getProvider(), model: aiService.getModel(), message: 'OpenRouter is configured.' }
      : { status: 'disconnected', provider: aiService.getProvider(), model: aiService.getModel(), message: 'OpenRouter API key is not configured.' };
    return res.json(result);
  } catch (error) {
    Logger.error('AI test failed', { error: error instanceof Error ? error.message : String(error) });
    return res.status(500).json({ error: 'Failed to test OpenRouter connection.' });
  }
});

app.listen(port, () => {
  Logger.info(`Personal AI Agent server listening on http://localhost:${port}`);
});
