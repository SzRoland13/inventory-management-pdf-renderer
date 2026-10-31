import type { LogLevel } from '@/config';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export enum LoggerEvent {
  ServerStarted = 'server_started',
  ServerShuttingDown = 'server_shutting_down',
  StartupFailed = 'startup_failed',
  HttpShutdownFailed = 'http_shutdown_failed',
  BrowserShutdownFailed = 'browser_shutdown_failed',
  BrowserLaunchFailed = 'browser_launch_failed',
  RequestFailed = 'request_failed',
  RenderCompleted = 'render_completed',
  RenderFailed = 'render_failed',
  ContextCloseFailed = 'context_close_failed',
}

export interface Logger {
  debug?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  info?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  warn?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  error?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
}

export function createLogger(level: LogLevel = 'info'): Required<Logger> {
  const threshold = LEVELS[level] ?? LEVELS.info;

  return Object.fromEntries(
    Object.entries(LEVELS).map(([name, value]) => [
      name,
      (event: LoggerEvent, fields: Record<string, unknown> = {}) => {
        if (value < threshold) {
          return;
        }

        const record = {
          timestamp: new Date().toISOString(),
          level: name,
          event,
          ...fields,
        };
        const output = JSON.stringify(record);
        (value >= LEVELS.error ? process.stderr : process.stdout).write(
          `${output}\n`,
        );
      },
    ]),
  ) as Required<Logger>;
}
