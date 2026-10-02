import { randomUUID } from 'node:crypto';
import type { AgentState } from '../types/index.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskStep = {
  id: string;
  title: string;
  status: 'pending' | 'done';
};

export type StoredTask = {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  progress: number;
  steps: TaskStep[];
  error?: string;
  result?: string;
};

export class TaskService {
  private tasks = new Map<string, StoredTask>();

  createTask(title: string): StoredTask {
    const now = new Date().toISOString();
    const task: StoredTask = {
      id: randomUUID(),
      title,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      progress: 0,
      steps: []
    };
    this.tasks.set(task.id, task);
    return task;
  }

  getTask(id: string): StoredTask | undefined {
    return this.tasks.get(id);
  }

  listTasks(): StoredTask[] {
    return [...this.tasks.values()];
  }

  updateTask(id: string, patch: Partial<StoredTask>): StoredTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: StoredTask = {
      ...task,
      ...patch,
      steps: patch.steps ?? task.steps,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, updated);
    return updated;
  }

  setStatus(id: string, status: TaskStatus): StoredTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const now = new Date().toISOString();
    const updated: StoredTask = {
      ...task,
      status,
      updatedAt: now,
      startedAt: status === 'running' ? task.startedAt ?? now : task.startedAt,
      finishedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? now : task.finishedAt,
      durationMs: task.startedAt ? new Date(now).getTime() - new Date(task.startedAt).getTime() : task.durationMs
    };

    this.tasks.set(id, updated);
    return updated;
  }

  addStep(id: string, title: string): StoredTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: StoredTask = {
      ...task,
      steps: [...task.steps, { id: randomUUID(), title, status: 'pending' }],
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(id, updated);
    return updated;
  }

  markStepDone(id: string, stepId: string): StoredTask | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: StoredTask = {
      ...task,
      steps: task.steps.map((step) => (step.id === stepId ? { ...step, status: 'done' } : step)),
      updatedAt: new Date().toISOString()
    };

    this.tasks.set(id, updated);
    return updated;
  }

  deleteTask(id: string): boolean {
    return this.tasks.delete(id);
  }
}
