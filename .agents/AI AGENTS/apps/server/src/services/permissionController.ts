import { PermissionService } from './permissionService.js';

export class PermissionController {
  static async require(area: 'browser' | 'files' | 'computer_control' | 'applications' | 'internet', action: 'READ' | 'WRITE' | 'DELETE' | 'OPEN' | 'EXECUTE' | 'SEARCH', approval: boolean) {
    if (!approval) {
      throw new Error('User denied permission.');
    }

    PermissionService.grant(area, action);
    return { ok: true, area, action, approved: approval };
  }
}
