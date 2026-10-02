export type LocalAgentStatus = 'Connected' | 'Disconnected' | 'Error';

export type LocalAgentCommand =
  | { type: 'screenshot'; path?: string }
  | { type: 'mouseMove'; x: number; y: number }
  | { type: 'click'; button?: 'left' | 'right'; x?: number; y?: number }
  | { type: 'doubleClick'; x?: number; y?: number }
  | { type: 'rightClick'; x?: number; y?: number }
  | { type: 'type'; text: string }
  | { type: 'keyPress'; key: string }
  | { type: 'scroll'; direction: 'up' | 'down' | 'left' | 'right'; amount?: number }
  | { type: 'openApplication'; appName: string }
  | { type: 'closeApplication'; appName: string };

export type LocalAgentConnection = {
  status: LocalAgentStatus;
  url: string;
  token: string;
  message: string;
};

export class LocalAgentService {
  constructor(
    private readonly config: { url: string; token: string } = { url: process.env.LOCAL_AGENT_URL ?? '', token: process.env.LOCAL_AGENT_TOKEN ?? '' }
  ) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.config.url) {
      throw new Error('Local Computer Agent is not configured.');
    }

    const response = await fetch(new URL(path, this.config.url).toString(), {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
        ...(init?.headers ?? {})
      }
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : {};

    if (!response.ok) {
      throw new Error(data.message ?? `Local agent request failed with status ${response.status}.`);
    }

    return data as T;
  }

  getStatus(): LocalAgentConnection {
    if (!this.config.url) {
      return {
        status: 'Disconnected',
        url: this.config.url,
        token: this.config.token,
        message: 'Local Computer Agent is not configured.'
      };
    }

    return {
      status: 'Connected',
      url: this.config.url,
      token: this.config.token,
      message: this.config.token
        ? 'Local Computer Agent endpoint is configured.'
        : 'Local Computer Agent endpoint is configured without a token.'
    };
  }

  async healthCheck(): Promise<LocalAgentConnection> {
    if (!this.config.url) {
      return this.getStatus();
    }

    try {
      const result = await this.request<{ ok: boolean; status?: string; message?: string }>('health');
      return {
        status: result.ok ? 'Connected' : 'Error',
        url: this.config.url,
        token: this.config.token,
        message: result.message ?? 'Local Computer Agent endpoint is responding.'
      };
    } catch (error) {
      return {
        status: 'Error',
        url: this.config.url,
        token: this.config.token,
        message: error instanceof Error ? error.message : 'Local Computer Agent is not reachable.'
      };
    }
  }

  async execute(command: LocalAgentCommand, timeoutMs = 15000) {
    if (!this.config.url) {
      throw new Error('Local Computer Agent is not connected.');
    }

    const result = await this.request<{ ok: boolean; status: string; message: string; command?: LocalAgentCommand; result?: Record<string, unknown> }>('execute', {
      method: 'POST',
      body: JSON.stringify({ command, timeoutMs })
    });

    return {
      ok: result.ok,
      command: result.command ?? command,
      message: result.message,
      status: result.status,
      result: result.result ?? {}
    };
  }

  async cancel(jobId: string) {
    const result = await this.request<{ ok: boolean; status: string; message: string }>('cancel', {
      method: 'POST',
      body: JSON.stringify({ jobId })
    });

    return {
      ok: result.ok,
      status: result.status,
      message: result.message
    };
  }
}
