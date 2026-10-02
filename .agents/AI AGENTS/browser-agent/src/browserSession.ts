import { randomUUID } from 'node:crypto';
import type { BrowserSession, BrowserSessionStatus } from './types.js';

export class BrowserSessionManager {
  private session: BrowserSession | null = null;

  createSession(): BrowserSession {
    if (this.session && this.session.status !== 'closed' && this.session.status !== 'error') {
      return this.session;
    }

    const now = new Date().toISOString();
    this.session = {
      sessionId: randomUUID(),
      status: 'starting',
      currentUrl: '',
      title: '',
      createdAt: now,
      updatedAt: now
    };

    return this.session;
  }

  getSession(): BrowserSession | null {
    return this.session;
  }

  updateStatus(status: BrowserSessionStatus, currentUrl = '', title = ''): BrowserSession | null {
    if (!this.session) return null;
    this.session = {
      ...this.session,
      status,
      currentUrl,
      title,
      updatedAt: new Date().toISOString()
    };
    return this.session;
  }

  closeSession(): BrowserSession | null {
    if (!this.session) return null;
    this.session = {
      ...this.session,
      status: 'closed',
      updatedAt: new Date().toISOString()
    };
    return this.session;
  }
}
