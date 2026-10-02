import { z } from 'zod';

export const LocalAgentTokenSchema = z.object({
  token: z.string().min(1, 'Token required')
});

export const SafeOpenApplicationSchema = z.object({
  type: z.literal('openApplication'),
  appName: z.string().trim().min(1).max(80),
  args: z.array(z.string()).optional().default([]),
  workingDirectory: z.string().trim().max(200).optional()
});

export const SafeMouseActionSchema = z.object({
  type: z.enum(['mouseMove', 'click', 'doubleClick', 'rightClick', 'scroll']),
  x: z.number().int().min(0).max(50000).optional(),
  y: z.number().int().min(0).max(50000).optional(),
  button: z.enum(['left', 'right']).optional(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  amount: z.number().int().min(1).max(5000).optional()
});

export const LocalAgentCommandSchema = z.discriminatedUnion('type', [
  SafeOpenApplicationSchema,
  z.object({
    type: z.literal('screenshot'),
    path: z.string().trim().max(300).optional()
  }),
  SafeMouseActionSchema,
  z.object({
    type: z.literal('type'),
    text: z.string().max(5000)
  }),
  z.object({
    type: z.literal('keyPress'),
    key: z.string().trim().min(1).max(20)
  }),
  z.object({
    type: z.literal('closeApplication'),
    appName: z.string().trim().min(1).max(80)
  })
]);

export type LocalAgentCommand = z.infer<typeof LocalAgentCommandSchema>;
export type SafeOpenApplicationCommand = z.infer<typeof SafeOpenApplicationSchema>;

export type LocalAgentRequest = {
  command: LocalAgentCommand;
  timeoutMs?: number;
};

export const LocalAgentExecuteRequestSchema = z.object({
  command: LocalAgentCommandSchema,
  timeoutMs: z.number().int().positive().max(60000).optional()
});

export const LocalAgentHealthResponse = z.object({
  ok: z.boolean(),
  status: z.enum(['ok', 'error']),
  pid: z.number().optional(),
  environment: z.enum(['windows', 'linux', 'darwin']),
  hostname: z.string(),
  uptimeMs: z.number(),
  startedAt: z.string(),
  allowlist: z.array(z.string())
});

export const LocalAgentExecuteResponseSchema = z.object({
  ok: z.boolean(),
  status: z.enum(['completed', 'rejected', 'cancelled', 'timeout']),
  command: LocalAgentCommandSchema,
  result: z.record(z.any()).optional(),
  message: z.string()
});
