import type { LoggerEvent } from '@/enums/logger-event';

export interface Logger {
  debug?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  info?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  warn?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
  error?: (event: LoggerEvent, fields?: Record<string, unknown>) => void;
}
