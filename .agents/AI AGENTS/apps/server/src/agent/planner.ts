import { z } from 'zod';
import type { ParsedIntent, PlanStep, Task } from '../types/index.js';

const IntentSchema = z.object({
  goal: z.string(),
  taskType: z.string(),
  requiresBrowser: z.boolean().default(false),
  requiresComputer: z.boolean().default(false)
});

export class AgentPlanner {
  parseIntent(input: string): ParsedIntent {
    const normalized = input.toLowerCase();

    const requiresBrowser = /(chrome|browser|google|search|web|website|open|capcut|tutorial|research|download)/i.test(normalized);
    const requiresComputer = /(open|launch|click|type|screenshot|file|folder|application|app|computer|desktop|setting|window|notepad|search)/i.test(normalized);

    const taskType = requiresBrowser && requiresComputer ? 'browser-and-computer' : requiresBrowser ? 'browser' : requiresComputer ? 'computer' : 'general';

    return {
      goal: input.trim() || 'Unknown request',
      taskType,
      requiresBrowser,
      requiresComputer
    };
  }

  createPlan(goal: string): PlanStep[] {
    return [
      { id: 'understand', title: 'Understand request', description: `Analyze: ${goal}`, status: 'done' },
      { id: 'plan', title: 'Create plan', description: 'Decide tool usage and execution flow', status: 'done' },
      { id: 'execute', title: 'Execute steps', description: 'Run required agent tools', status: 'pending' },
      { id: 'observe', title: 'Observe results', description: 'Check outcomes and verify completion', status: 'pending' },
      { id: 'respond', title: 'Prepare final response', description: 'Summarize findings for the user', status: 'pending' }
    ];
  }

  buildTask(title: string): Task {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title,
      status: 'PLANNING',
      steps: this.createPlan(title),
      createdAt: now,
      updatedAt: now
    };
  }

  suggestTools(goal: string) {
    const normalized = goal.toLowerCase();
    const suggestions = new Set<string>();

    if (/(search|google|browser|website|web|capcut|tutorial|research|download)/i.test(normalized)) {
      suggestions.add('browser.search');
      suggestions.add('browser.open');
    }

    if (/(open|launch|chrome|notepad|app|application|window|desktop|click|type|setting)/i.test(normalized)) {
      suggestions.add('browser.open');
      suggestions.add('computer.vision.analyze');
    }

    if (/(screenshot|screen|vision|analyze|observe|look)/i.test(normalized)) {
      suggestions.add('computer.vision.analyze');
    }

    if (/(file|folder|save|download|organize)/i.test(normalized)) {
      suggestions.add('browser.search');
    }

    return [...suggestions];
  }

  buildExecutionPlan(goal: string) {
    const normalized = goal.toLowerCase();
    const steps: string[] = [];

    if (/(chrome|browser|search|google|web|website|capcut|tutorial|research)/i.test(normalized)) {
      steps.push('open the relevant browser or app');
      steps.push('capture or inspect the current screen');
      steps.push('identify the correct element or target');
      steps.push('perform the required action');
      steps.push('verify the result with a fresh observation');
    }

    if (/(open|launch|application|app|notepad|desktop|window|setting)/i.test(normalized)) {
      steps.push('open the target application');
      steps.push('observe the screen state');
      steps.push('perform the required user action');
      steps.push('verify the application reflects the requested change');
    }

    if (steps.length === 0) {
      steps.push('understand the requested outcome');
      steps.push('select the best available tool path');
      steps.push('execute and verify the result');
    }

    return steps;
  }
}
