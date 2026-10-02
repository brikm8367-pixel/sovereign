import { describe, expect, it } from 'vitest';
import { BrowserAgentService } from '../src/services/browserAgentService.js';

describe('Browser Agent Service', () => {
  it('launches, navigates, and reads a page', async () => {
    const service = new BrowserAgentService();
    const launch = await service.launch();
    expect(launch.ok).toBe(true);

    const nav = await service.navigate('https://example.com');
    expect(nav.ok).toBe(true);

    const page = await service.readPage();
    expect(page.ok).toBe(true);
    expect(page.text).toBeTruthy();

    await service.close();
  });

  it('searches Google for CapCut and reads the result page', async () => {
    const service = new BrowserAgentService();
    const launch = await service.launch();
    expect(launch.ok).toBe(true);

    const search = await service.search('CapCut', 'google');
    expect(search.ok).toBe(true);

    const page = await service.readPage();
    expect(page.ok).toBe(true);
    expect(page.text).toBeTruthy();

    await service.close();
  });

  it('rejects invalid URL input', async () => {
    const service = new BrowserAgentService();
    await service.launch();
    const result = await service.navigate('not a valid url');
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('NAVIGATION_FAILED');
    await service.close();
  });
});
