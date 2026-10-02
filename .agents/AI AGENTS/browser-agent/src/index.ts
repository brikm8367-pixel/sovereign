import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { BrowserSessionManager } from './browserSession.js';
import type { BrowserActionResult, BrowserSession } from './types.js';

export class BrowserAgentService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private readonly sessions = new BrowserSessionManager();
  private readonly screenshotsDir = path.resolve(process.cwd(), 'browser-agent', 'artifacts');

  getSession(): BrowserSession | null {
    return this.sessions.getSession();
  }

  async launch(): Promise<BrowserActionResult> {
    if (this.browser && this.page) {
      return { ok: true, status: 'success', message: 'Browser already running.', sessionId: this.getSession()?.sessionId }; 
    }

    try {
      const session = this.sessions.createSession();
      this.sessions.updateStatus('starting');
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
      });
      this.page = await this.browser.newPage();
      await this.page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      this.sessions.updateStatus('ready', 'about:blank', '');

      return {
        ok: true,
        status: 'success',
        message: 'Browser launched successfully.',
        sessionId: session.sessionId,
        url: 'about:blank'
      };
    } catch (error) {
      this.sessions.updateStatus('error');
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Browser launch failed.',
        error: { code: 'BROWSER_LAUNCH_FAILED', message: error instanceof Error ? error.message : 'Browser launch failed.' }
      };
    }
  }

  async close(): Promise<BrowserActionResult> {
    if (!this.browser) {
      this.sessions.closeSession();
      return { ok: true, status: 'success', message: 'Browser is already closed.' };
    }

    try {
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.sessions.closeSession();
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

  async navigate(url: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'Browser is not running. Call launch() first.', error: { code: 'BROWSER_NOT_RUNNING', message: 'Browser is not running.' } };
    }

    try {
      const parsed = new URL(url);
      this.sessions.updateStatus('busy', parsed.toString(), '');
      await this.page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      const title = await this.page.title();
      const currentUrl = this.page.url();
      this.sessions.updateStatus('ready', currentUrl, title);
      return { ok: true, status: 'success', message: 'Navigation succeeded.', url: currentUrl, title };
    } catch (error) {
      this.sessions.updateStatus('error');
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Navigation failed.',
        url,
        error: { code: 'NAVIGATION_FAILED', message: error instanceof Error ? error.message : 'Navigation failed.' }
      };
    }
  }

  async search(query: string, engine = 'google'): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'Browser is not running. Call launch() first.', error: { code: 'BROWSER_NOT_RUNNING', message: 'Browser is not running.' } };
    }

    try {
      this.sessions.updateStatus('busy');
      const searchUrl = engine === 'google' ? 'https://www.google.com' : 'https://www.bing.com';
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const searchInput = engine === 'google' ? 'textarea[name="q"]' : 'input[name="q"]';
      await this.page.fill(searchInput, query);
      await this.page.press(searchInput, 'Enter');
      await this.page.waitForLoadState('networkidle', { timeout: 30000 });

      const url = this.page.url();
      const title = await this.page.title();
      this.sessions.updateStatus('ready', url, title);
      return { ok: true, status: 'success', message: `Search for "${query}" completed.`, url, title };
    } catch (error) {
      this.sessions.updateStatus('error');
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Search failed.',
        error: { code: 'SEARCH_FAILED', message: error instanceof Error ? error.message : 'Search failed.' }
      };
    }
  }

  async readPage(): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      this.sessions.updateStatus('busy');
      const [title, url, text, links] = await Promise.all([
        this.page.title(),
        this.page.url(),
        this.page.locator('body').innerText(),
        this.page.locator('a[href]').evaluateAll((anchors) => anchors
          .map((anchor) => ({ text: (anchor.textContent ?? '').trim(), href: (anchor as HTMLAnchorElement).href }))
          .filter((link) => !!link.text && !!link.href)
          .slice(0, 15))
      ]);

      const summary = text.replace(/\s+/g, ' ').trim().slice(0, 2000);
      this.sessions.updateStatus('ready', url, title);
      return {
        ok: true,
        status: 'success',
        message: 'Page successfully read.',
        url,
        title,
        text: summary,
        links
      };
    } catch (error) {
      this.sessions.updateStatus('error');
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Page read failed.',
        error: { code: 'PAGE_READ_FAILED', message: error instanceof Error ? error.message : 'Page read failed.' }
      };
    }
  }

  async extractText(selector?: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      const target = selector ? this.page.locator(selector) : this.page.locator('body');
      const text = await target.innerText();
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

  async click(selector: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      this.sessions.updateStatus('busy');
      await this.page.locator(selector).click({ timeout: 15000 });
      this.sessions.updateStatus('ready', this.page.url(), await this.page.title());
      return { ok: true, status: 'success', message: `Clicked selector: ${selector}` };
    } catch (error) {
      this.sessions.updateStatus('error');
      return {
        ok: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Click failed.',
        error: { code: 'CLICK_FAILED', message: error instanceof Error ? error.message : 'Click failed.' }
      };
    }
  }

  async type(selector: string, text: string): Promise<BrowserActionResult> {
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

  async press(key: string): Promise<BrowserActionResult> {
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

  async screenshot(pathOverride?: string): Promise<BrowserActionResult> {
    if (!this.page) {
      return { ok: false, status: 'error', message: 'No active page.', error: { code: 'NO_ACTIVE_PAGE', message: 'No active page.' } };
    }

    try {
      await mkdir(this.screenshotsDir, { recursive: true });
      const fileName = `${randomUUID()}.png`;
      const destination = pathOverride ?? path.join(this.screenshotsDir, fileName);
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

  async getCurrentUrl(): Promise<string> {
    if (!this.page) return '';
    return this.page.url();
  }

  async getTitle(): Promise<string> {
    if (!this.page) return '';
    return this.page.title();
  }
}
