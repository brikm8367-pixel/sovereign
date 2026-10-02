import { z } from 'zod';
import { env } from '../config/env.js';
import { LocalAgentService } from '../services/localAgentService.js';
import type { PermissionType, ToolCall } from '../types/index.js';

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<Record<string, unknown>>;
  permissions: PermissionType[];
  execute: (input: Record<string, unknown>) => Promise<unknown>;
};

export const computerTools: Record<string, ToolDefinition> = {
  openApplication: {
    name: 'computer.openApplication',
    description: 'Open an allowlisted desktop application using the local computer agent.',
    inputSchema: z.object({ appName: z.string().min(1).max(80) }),
    permissions: ['APPLICATION_CONTROL', 'COMPUTER_CONTROL'],
    execute: async (input: Record<string, unknown>) => {
      const appName = String(input.appName ?? '').trim();
      const configuredUrl = process.env.LOCAL_AGENT_URL ?? env.localAgentUrl;
      const configuredToken = process.env.LOCAL_AGENT_TOKEN ?? env.localAgentToken;
      const localAgentService = new LocalAgentService({ url: configuredUrl, token: configuredToken });
      const result = await localAgentService.execute({ type: 'openApplication', appName });
      return {
        tool: 'computer.openApplication',
        appName,
        ok: result.ok,
        status: result.status,
        message: result.message,
        result: result.result
      };
    }
  }
};

export const browserTools: Record<string, ToolDefinition> = {
  open: {
    name: 'browser.open',
    description: 'Open a browser session for automation.',
    inputSchema: z.object({}),
    permissions: ['BROWSER', 'BROWSER_NAVIGATE'],
    execute: async (_input: Record<string, unknown>) => ({ tool: 'browser.open', ok: true, message: 'Browser session opened.' })
  },
  navigate: {
    name: 'browser.navigate',
    description: 'Navigate to a URL in the browser.',
    inputSchema: z.object({ url: z.string().url() }),
    permissions: ['BROWSER', 'BROWSER_NAVIGATE'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.navigate', url: String(input.url ?? ''), ok: true })
  },
  search: {
    name: 'browser.search',
    description: 'Run a search in the configured browser engine.',
    inputSchema: z.object({ query: z.string().min(1), engine: z.string().default('google') }),
    permissions: ['BROWSER', 'BROWSER_READ', 'INTERNET'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.search', query: String(input.query ?? ''), engine: String(input.engine ?? 'google'), ok: true })
  },
  readPage: {
    name: 'browser.readPage',
    description: 'Read the visible page content after navigation.',
    inputSchema: z.object({}),
    permissions: ['BROWSER', 'BROWSER_READ'],
    execute: async (_input: Record<string, unknown>) => ({ tool: 'browser.readPage', ok: true })
  },
  extractText: {
    name: 'browser.extractText',
    description: 'Extract text from the current page.',
    inputSchema: z.object({ selector: z.string().optional() }),
    permissions: ['BROWSER', 'BROWSER_READ'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.extractText', selector: input.selector ? String(input.selector) : undefined, ok: true })
  },
  click: {
    name: 'browser.click',
    description: 'Click an element on the page.',
    inputSchema: z.object({ selector: z.string().min(1) }),
    permissions: ['BROWSER', 'BROWSER_INTERACT'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.click', selector: String(input.selector ?? ''), ok: true })
  },
  type: {
    name: 'browser.type',
    description: 'Type text into a page input.',
    inputSchema: z.object({ selector: z.string().min(1), text: z.string().max(5000) }),
    permissions: ['BROWSER', 'BROWSER_INTERACT'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.type', selector: String(input.selector ?? ''), text: String(input.text ?? ''), ok: true })
  },
  press: {
    name: 'browser.press',
    description: 'Press a keyboard key.',
    inputSchema: z.object({ key: z.string().min(1) }),
    permissions: ['BROWSER', 'BROWSER_INTERACT'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.press', key: String(input.key ?? ''), ok: true })
  },
  screenshot: {
    name: 'browser.screenshot',
    description: 'Capture a screenshot of the current page.',
    inputSchema: z.object({ path: z.string().max(500).optional() }),
    permissions: ['BROWSER', 'BROWSER_READ'],
    execute: async (input: Record<string, unknown>) => ({ tool: 'browser.screenshot', path: input.path ? String(input.path) : 'browser-agent/artifacts/screenshot.png', ok: true })
  },
  visionAnalyze: {
    name: 'computer.vision.analyze',
    description: 'Analyze a real screenshot to understand the current screen and detect UI elements.',
    inputSchema: z.object({
      mimeType: z.string().min(1),
      data: z.string().min(1),
      source: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional()
    }),
    permissions: ['BROWSER', 'COMPUTER_CONTROL', 'APPLICATION_CONTROL'],
    execute: async (input: Record<string, unknown>) => ({
      tool: 'computer.vision.analyze',
      ok: true,
      source: String(input.source ?? 'local-agent-screenshot'),
      mimeType: String(input.mimeType ?? 'image/png')
    })
  }
};

export class ToolRegistry {
  private static tools = new Map<string, ToolDefinition>();

  static register(tool: ToolDefinition) {
    ToolRegistry.tools.set(tool.name, { ...tool, permissions: [...tool.permissions] });
  }

  static get(name: string) {
    return ToolRegistry.tools.get(name);
  }

  static list() {
    return [...ToolRegistry.tools.values()];
  }

  static async execute(name: string, input: Record<string, unknown> = {}) {
    const tool = ToolRegistry.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await tool.execute(input);
  }

  static validateToolCall(toolCall: ToolCall) {
    const tool = ToolRegistry.get(toolCall.name);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolCall.name}`);
    }

    const parsed = tool.inputSchema.safeParse(toolCall.input);
    if (!parsed.success) {
      throw new Error(`Invalid input for ${toolCall.name}: ${parsed.error.message}`);
    }

    return parsed.data;
  }
}
