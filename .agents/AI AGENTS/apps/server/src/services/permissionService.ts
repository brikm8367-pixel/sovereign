import { z } from 'zod';

export type PermissionArea = 'browser' | 'files' | 'computer_control' | 'applications' | 'internet';
export type PermissionAction = 'READ' | 'WRITE' | 'DELETE' | 'OPEN' | 'EXECUTE' | 'SEARCH';

const allowed = new Map<string, Set<PermissionAction>>([
  ['browser', new Set(['READ', 'SEARCH', 'OPEN'])],
  ['files', new Set(['READ', 'WRITE', 'DELETE'])],
  ['computer_control', new Set(['OPEN', 'EXECUTE'])],
  ['applications', new Set(['OPEN'])],
  ['internet', new Set(['READ', 'SEARCH'])]
]);

const grantState = new Map<string, boolean>();

export class PermissionService {
  static grant(area: PermissionArea, action: PermissionAction): void {
    const key = `${area}:${action}`;
    grantState.set(key, true);
  }

  static deny(area: PermissionArea, action: PermissionAction): void {
    const key = `${area}:${action}`;
    grantState.set(key, false);
  }

  static require(area: PermissionArea, action: PermissionAction): void {
    const key = `${area}:${action}`;
    const permitted = allowed.get(area)?.has(action) ?? false;

    if (!permitted) {
      throw new Error(`Permission not allowed: ${area}:${action}.`);
    }

    const granted = grantState.get(key) ?? false;
    if (!granted && area !== 'browser') {
      throw new Error(`Permission required: ${area}:${action}. User approval required.`);
    }

    if (!granted && area === 'browser' && (action === 'READ' || action === 'SEARCH')) {
      grantState.set(key, true);
    }
  }

  static check(area: PermissionArea, action: PermissionAction): boolean {
    return (allowed.get(area)?.has(action) ?? false) && (grantState.get(`${area}:${action}`) ?? false);
  }

  static schema() {
    return z.object({
      area: z.enum(['browser', 'files', 'computer_control', 'applications', 'internet']),
      action: z.enum(['READ', 'WRITE', 'DELETE', 'OPEN', 'EXECUTE', 'SEARCH']),
      approved: z.boolean().default(false)
    });
  }
}
