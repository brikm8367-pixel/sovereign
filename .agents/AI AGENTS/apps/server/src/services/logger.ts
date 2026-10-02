export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export class Logger {
  static info(message: string, meta?: Record<string, unknown>) {
    this.write('INFO', message, meta);
  }

  static warn(message: string, meta?: Record<string, unknown>) {
    this.write('WARN', message, meta);
  }

  static error(message: string, meta?: Record<string, unknown>) {
    this.write('ERROR', message, meta);
  }

  static debug(message: string, meta?: Record<string, unknown>) {
    this.write('DEBUG', message, meta);
  }

  private static write(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const sanitized = meta ? JSON.stringify(this.sanitize(meta)) : '';
    const line = `[${new Date().toISOString()}] ${level} ${message}${sanitized ? ` ${sanitized}` : ''}`;
    // eslint-disable-next-line no-console
    console.log(line);
  }

  private static sanitize(value: Record<string, unknown>) {
    const clone: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string' && /(api[_-]?key|token|secret|password)/i.test(key)) {
        clone[key] = '[REDACTED]';
      } else {
        clone[key] = entry;
      }
    }
    return clone;
  }
}
