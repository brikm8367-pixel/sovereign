import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

export type BrowserCommand =
  | { type: 'open'; url?: string }
  | { type: 'navigate'; url: string }
  | { type: 'search'; query: string; engine?: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'readPage'; selector?: string }
  | { type: 'screenshot'; path?: string }
  | { type: 'extractText'; selector?: string }
  | { type: 'getCurrentUrl' }
  | { type: 'getTitle' };

export class BrowserAgentService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly screenshotsDir = path.resolve(process.cwd(), 'browser-agent', 'artifacts');

  async launch() {
    if (this.browser && this.page) {
      return { ok: true, status: 'success', message: 'Browser already running.' };
    }

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      this.page = await this.browser.newPage();
      await this.page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      return { ok: true, status: 'success', message: 'Browser launched successfully.', url: 'about:blank' };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Browser launch failed.',
        error: { code: 'BROWSER_LAUNCH_FAILED', message: error instanceof Error ? error.message : 'Browser launch failed.' }
      };
    }
  }

  async close() {
    if (!this.browser) {
      return { ok: true, status: 'success', message: 'Browser is already closed.' };
    }

    try {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      return { ok: true, status: 'success', message: 'Browser closed.' };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Browser close failed.',
        error: { code: 'BROWSER_CLOSE_FAILED', message: error instanceof Error ? error.message : 'Browser close failed.' }
      };
    }
  }

  async navigate(url: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'Browser is not running. Call launch() first.', error: { code: 'BROWSER_NOT_RUNNING', message: 'Browser is not running.' } };
    }

    try {
      const parsed = new URL(url);
      await this.page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { ok: true, status: 'success', message: 'Navigation succeeded.', url: this.page.url(), title: await this.page.title() };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Navigation failed.',
        url,
        error: { code: 'NAVIGATION_FAILED', message: error instanceof Error ? error.message : 'Navigation failed.' }
      };
    }
  }

  async search(query: string, engine = 'google') {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'Browser is not running. Call launch() first.', error: { code: 'BROWSER_NOT_RUNNING', message: 'Browser is not running.' } };
    }

    try {
      const searchUrl = engine === 'google' ? 'https://www.google.com/search' : 'https://www.bing.com/search';
      const targetUrl = new URL(searchUrl);
      targetUrl.searchParams.set('q', query);

      await this.page.goto(targetUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 });

      return {
        ok: true,
        status: 'success',
        message: `Search for "${query}" completed.`,
        url: this.page.url(),
        title: await this.page.title()
      };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Search failed.',
        error: { code: 'SEARCH_FAILED', message: error instanceof Error ? error.message : 'Search failed.' }
      };
    }
  }

  async readPage() {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      const title = await this.page.title();
      const url = this.page.url();
      const text = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 2000);
      const links = await this.page.locator('a[href]').evaluateAll((anchors) => anchors
        .map((anchor) => ({ text: (anchor.textContent ?? '').trim(), href: (anchor as HTMLAnchorElement).href }))
        .filter((link) => !!link.text && !!link.href)
        .slice(0, 15));
      return { ok: true, status: 'success', message: 'Page successfully read.', url, title, text, links };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Page read failed.',
        error: { code: 'PAGE_READ_FAILED', message: error instanceof Error ? error.message : 'Page read failed.' }
      };
    }
  }

  async extractText(selector?: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      const text = await (selector ? this.page.locator(selector) : this.page.locator('body')).innerText();
      return { ok: true, status: 'success', message: 'Text extracted.', text: text.replace(/\s+/g, ' ').trim().slice(0, 2000) };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Text extraction failed.',
        error: { code: 'EXTRACT_FAILED', message: error instanceof Error ? error.message : 'Text extraction failed.' }
      };
    }
  }

  async click(selector: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      await this.page.locator(selector).click({ timeout: 15000 });
      return { ok: true, status: 'success', message: `Clicked selector: ${selector}` };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Click failed.',
        error: { code: 'CLICK_FAILED', message: error instanceof Error ? error.message : 'Click failed.' }
      };
    }
  }

  async type(selector: string, text: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      await this.page.locator(selector).fill(text, { timeout: 15000 });
      return { ok: true, status: 'success', message: `Typed text into selector: ${selector}` };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Type failed.',
        error: { code: 'TYPE_FAILED', message: error instanceof Error ? error.message : 'Type failed.' }
      };
    }
  }

  async press(key: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      await this.page.keyboard.press(key);
      return { ok: true, status: 'success', message: `Pressed key: ${key}` };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Key press failed.',
        error: { code: 'KEY_PRESS_FAILED', message: error instanceof Error ? error.message : 'Key press failed.' }
      };
    }
  }

  async screenshot(pathOverride?: string) {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      await mkdir(this.screenshotsDir, { recursive: true });
      const destination = pathOverride ?? path.join(this.screenshotsDir, `${randomUUID()}.png`);
      await this.page.screenshot({ path: destination, fullPage: false });
      return { ok: true, status: 'success', message: 'Screenshot captured.', path: destination };
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Screenshot failed.',
        error: { code: 'SCREENSHOT_FAILED', message: error instanceof Error ? error.message : 'Screenshot failed.' }
      };
    }
  }

  async getCurrentUrl() {
    return this.page ? this.page.url() : '';
  }

  async getTitle() {
    return this.page ? this.page.title() : '';
  }

  async execute(command: BrowserCommand) {
    switch (command.type) {
      case 'open':
        return this.launch();
      case 'navigate':
        return this.navigate(command.url);
      case 'search':
        return this.search(command.query, command.engine ?? 'google');
      case 'click':
        return this.click(command.selector);
      case 'type':
        return this.type(command.selector, command.text);
      case 'readPage':
        return this.readPage();
      case 'extractText':
        return this.extractText(command.selector);
      case 'screenshot':
        return this.screenshot(command.path);
      case 'getCurrentUrl':
        return { ok: true, value: await this.getCurrentUrl() };
      case 'getTitle':
        return { ok: true, value: await this.getTitle() };
      default:
        return { ok: false, status: 'error', message: 'Unsupported browser command.' };
    }
  }
}

