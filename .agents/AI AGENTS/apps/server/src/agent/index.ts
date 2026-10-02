import { AgentPlanner } from './planner.js';
import { ToolRegistry, browserTools, computerTools } from './toolRegistry.js';
import { browserSearchTool } from './tools/browserSearchTool.js';

ToolRegistry.register(browserSearchTool);
Object.values(browserTools).forEach((tool) => {
  ToolRegistry.register({
    ...tool,
    permissions: [...tool.permissions]
  });
});
Object.values(computerTools).forEach((tool) => {
  ToolRegistry.register({
    ...tool,
    permissions: [...tool.permissions]
  });
});

export type VisionAction = {
  type: 'openApplication' | 'click' | 'type' | 'keyPress' | 'screenshot' | 'verify';
  value?: string;
  x?: number;
  y?: number;
  confidence?: number;
  reason?: string;
};

export class AgentEngine {
  constructor(private readonly planner = new AgentPlanner()) {}

  private extractAppName(input: string): string | undefined {
    const lower = input.toLowerCase();
    const known = ['discord', 'chrome', 'edge', 'firefox', 'notepad', 'calculator', 'outlook', 'explorer', 'code'];
    const matchedApp = known.find((app) => lower.includes(app));
    if (matchedApp) {
      return matchedApp;
    }

    const explicitMatch = input.match(/(?:open|launch|start)\s+(?:the\s+)?([a-z0-9._\- ]{1,40})/i);
    if (explicitMatch?.[1]) {
      return explicitMatch[1].trim();
    }

    return undefined;
  }

  async handleRequest(input: string) {
    const intent = this.planner.parseIntent(input);
    const task = this.planner.buildTask(input);
    const plan = this.planner.createPlan(input);
    const toolSuggestions = this.planner.suggestTools(input);
    const executionPlan = this.planner.buildExecutionPlan(input);
    const requiresConfirmation = /(delete|remove|send|submit|purchase|login|change settings|modify security|shutdown|restart)/i.test(input);

    const requestedAppName = this.extractAppName(input);
    const executedTools: Array<{ name: string; status: string; result: unknown; appName?: string }> = [];

    if (requestedAppName) {
      const appName = requestedAppName.toLowerCase();

      try {
        const result = await ToolRegistry.execute('computer.openApplication', { appName });
        executedTools.push({
          name: 'computer.openApplication',
          status: 'completed',
          result,
          appName
        });
      } catch (error) {
        executedTools.push({
          name: 'computer.openApplication',
          status: 'failed',
          result: {
            error: error instanceof Error ? error.message : 'Unknown execution error',
            appName
          },
          appName
        });
      }
    }

    const appLabel = executedTools[0]?.appName ?? requestedAppName ?? 'the requested application';
    const executionSummary = executedTools.length > 0
      ? `I attempted to open ${appLabel} and routed the command through the local agent.`
      : 'I planned the requested action and prepared the execution path.';

    return {
      intent,
      task,
      plan,
      toolSuggestions,
      executionPlan,
      requiresConfirmation,
      availableTools: ToolRegistry.list().map((tool) => tool.name),
      executedTools,
      executionSummary
    };
  }
}
