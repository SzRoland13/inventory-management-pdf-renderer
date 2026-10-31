import type { LogLevel } from '@/types/log-level';

export interface ServiceConfig {
  readonly token: string;
  readonly port: number;
  readonly host: string;
  readonly renderTimeoutMs: number;
  readonly maxHtmlBytes: number;
  readonly maxPdfBytes: number;
  readonly maxConcurrentRenders: number;
  readonly maxRenderQueue: number;
  readonly logLevel: LogLevel;
}
