export type AgentState =
  | 'IDLE'
  | 'UNDERSTANDING'
  | 'PLANNING'
  | 'WAITING_FOR_CONFIRMATION'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'REPLANNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type PermissionType =
  | 'READ'
  | 'WRITE'
  | 'DELETE'
  | 'BROWSER'
  | 'BROWSER_READ'
  | 'BROWSER_NAVIGATE'
  | 'BROWSER_INTERACT'
  | 'COMPUTER_CONTROL'
  | 'APPLICATION_CONTROL'
  | 'FILE_ACCESS'
  | 'INTERNET'
  | 'SENSITIVE';

export type ToolCall = {
  name: string;
  description: string;
  input: Record<string, unknown>;
  permissions: PermissionType[];
};

export type ParsedIntent = {
  goal: string;
  taskType: string;
  requiresBrowser: boolean;
  requiresComputer: boolean;
};

export type PlanStep = {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'done' | 'active';
};

export type Task = {
  id: string;
  title: string;
  status: AgentState;
  steps: PlanStep[];
  createdAt: string;
  updatedAt: string;
  result?: string;
  error?: string;
};
