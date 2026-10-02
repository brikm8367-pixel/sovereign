import { LocalAgentCommand, LocalAgentCommandSchema } from './types.js';

const ALLOWED_APP_PATTERNS = [
  /^code(?:\.exe)?$/i,
  /^notepad(?:\.exe)?$/i,
  /^calc(?:\.exe)?$/i,
  /^powershell(?:\.exe)?$/i,
  /^cmd(?:\.exe)?$/i,
  /^chrome(?:\.exe)?$/i,
  /^msedge(?:\.exe)?$/i,
  /^firefox(?:\.exe)?$/i,
  /^explorer(?:\.exe)?$/i,
  /^outlook(?:\.exe)?$/i,
  /^discord(?:\.exe)?$/i
];

export function ensureAllowedCommand(command: LocalAgentCommand): void {
  const parsed = LocalAgentCommandSchema.parse(command);

  if (parsed.type === 'openApplication') {
    const appName = parsed.appName.trim().toLowerCase();
    const allowed = ALLOWED_APP_PATTERNS.some((pattern) => pattern.test(appName));
    if (!allowed) {
      throw new Error(`Application '${parsed.appName}' is not allowed by local-agent allowlist.`);
    }
  }

  if (parsed.type === 'closeApplication') {
    const appName = parsed.appName.trim().toLowerCase();
    const allowed = ALLOWED_APP_PATTERNS.some((pattern) => pattern.test(appName));
    if (!allowed) {
      throw new Error(`Application '${parsed.appName}' is not allowed to be closed by the local agent.`);
    }
  }
}

export function getAllowlist(): string[] {
  return ['Code', 'Notepad', 'Calculator', 'PowerShell', 'Command Prompt', 'Chrome', 'Microsoft Edge', 'Firefox', 'File Explorer', 'Outlook', 'Discord'];
}
