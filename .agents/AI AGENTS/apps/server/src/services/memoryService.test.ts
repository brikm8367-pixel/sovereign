import { describe, expect, it } from 'vitest';
import { MemoryService } from './memoryService.js';

describe('Memory Service', () => {
  it('saves and searches user preference entries', () => {
    const memory = new MemoryService('memory-tests');
    memory.clear();
    memory.save({ kind: 'user-preference', title: 'content style', content: 'I create AI videos about automation', sensitive: false });

    expect(memory.search('automation').length).toBeGreaterThan(0);
    expect(memory.getAll().length).toBe(1);
  });

  it('withholds sensitive entries from search results', () => {
    const memory = new MemoryService('memory-tests-sensitive');
    memory.clear();
    memory.save({ kind: 'important-fact', title: 'token', content: 'secret_abc', sensitive: true });

    expect(memory.search('secret_abc').length).toBe(0);
  });
});
