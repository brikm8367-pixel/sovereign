import { z } from 'zod';
import type { ToolDefinition } from '../toolRegistry.js';

export const browserSearchTool: ToolDefinition = {
  name: 'browser.search',
  description: 'Search the web using the browser agent.',
  inputSchema: z.object({
    query: z.string().min(1),
    engine: z.string().default('google')
  }),
  permissions: ['BROWSER', 'INTERNET'],
  execute: async ({ query, engine }) => ({
    tool: 'browser.search',
    query,
    engine,
    result: `Demo search results for: ${query}`
  })
};
