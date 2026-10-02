import { TaskService } from './taskService.js';

export class TaskManagerService {
  private service = new TaskService();

  create(title: string) {
    return this.service.createTask(title);
  }

  list() {
    return this.service.listTasks();
  }

  get(id: string) {
    return this.service.getTask(id);
  }

  update(id: string, patch: Partial<any>) {
    return this.service.updateTask(id, patch);
  }

  cancel(id: string) {
    return this.service.setStatus(id, 'cancelled');
  }

  retry(id: string) {
    const task = this.service.getTask(id);
    if (!task) return undefined;
    return this.service.updateTask(id, {
      status: 'pending',
      progress: 0,
      error: undefined,
      result: undefined,
      updatedAt: new Date().toISOString()
    });
  }
}
