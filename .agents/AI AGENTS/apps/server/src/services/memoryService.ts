import { randomUUID } from 'node:crypto';
import type { MemoryEntry, MemoryKind, SaveMemoryInput } from '../types/memory.js';

export class MemoryService {
  private store = new Map<string, MemoryEntry>();

  constructor(private readonly namespace = 'default-memory') {}

  save(input: SaveMemoryInput): MemoryEntry {
    const entry: MemoryEntry = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      content: input.content,
      sensitive: Boolean(input.sensitive),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (entry.sensitive) {
      return entry;
    }

    this.store.set(entry.id, entry);
    return entry;
  }

  search(query: string): MemoryEntry[] {
    const value = query.trim().toLowerCase();
    if (!value) return [];

    return [...this.store.values()].filter((entry) => {
      const haystack = `${entry.title} ${entry.content} ${entry.kind}`.toLowerCase();
      return haystack.includes(value);
    });
  }

  getAll(): MemoryEntry[] {
    return [...this.store.values()];
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  clear(): void {
    this.store.clear();
  }

  get namespaceName() {
    return this.namespace;
  }
}
