import { MemoryService } from './memoryService.js';

export class MemoryController {
  constructor(private readonly memory = new MemoryService('runtime-memory')) {}

  save(input: { kind: string; title: string; content: string; sensitive?: boolean }) {
    return this.memory.save({
      kind: input.kind as any,
      title: input.title,
      content: input.content,
      sensitive: Boolean(input.sensitive)
    });
  }

  search(query: string) {
    return this.memory.search(query);
  }

  delete(id: string) {
    return this.memory.delete(id);
  }

  clear() {
    this.memory.clear();
  }
}
