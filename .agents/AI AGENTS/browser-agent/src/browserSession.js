import { randomUUID } from 'node:crypto';
export class BrowserSessionManager {
    session = null;
    createSession() {
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
    getSession() {
        return this.session;
    }
    updateStatus(status, currentUrl = '', title = '') {
        if (!this.session)
            return null;
        this.session = {
            ...this.session,
            status,
            currentUrl,
            title,
            updatedAt: new Date().toISOString()
        };
        return this.session;
    }
    closeSession() {
        if (!this.session)
            return null;
        this.session = {
            ...this.session,
            status: 'closed',
            updatedAt: new Date().toISOString()
        };
        return this.session;
    }
}
