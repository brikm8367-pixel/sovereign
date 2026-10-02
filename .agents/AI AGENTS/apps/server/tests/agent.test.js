import { describe, it, expect } from 'vitest';
import { AgentEngine } from '../src/agent/index.js';
import { ToolRegistry } from '../src/agent/toolRegistry.js';
describe('Agent integration', () => {
    it('creates a task and plan for a browser request', () => {
        const engine = new AgentEngine();
        const result = engine.handleRequest('Open Chrome and search for the best CapCut transitions');
        expect(result.task.title).toContain('Open Chrome');
        expect(result.intent.requiresBrowser).toBe(true);
        expect(result.availableTools).toContain('browser.search');
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
});
