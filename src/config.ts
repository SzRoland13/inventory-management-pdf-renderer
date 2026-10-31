import { ERROR_MESSAGES } from '@/errors';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export const DEFAULTS = Object.freeze({
  port: 3000,
  host: '0.0.0.0',
  renderTimeoutMs: 15_000,
  maxHtmlBytes: 1_048_576,
  maxConcurrentRenders: 4,
  maxRenderQueue: 16,
  logLevel: 'info',
});

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ServiceConfig {
  readonly token: string;
  readonly port: number;
  readonly host: string;
  readonly renderTimeoutMs: number;
  readonly maxHtmlBytes: number;
  readonly maxConcurrentRenders: number;
  readonly maxRenderQueue: number;
  readonly logLevel: LogLevel;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  { allowZero = false }: { allowZero?: boolean } = {},
): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < (allowZero ? 0 : 1)) {
    throw new Error(ERROR_MESSAGES.invalidInteger);
  }

  return parsed;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): ServiceConfig {
  const token = env.RENDERER_API_TOKEN;

  if (!token || token.length < 32) {
    throw new Error(ERROR_MESSAGES.configTokenRequired);
  }

  const logLevel = env.LOG_LEVEL || DEFAULTS.logLevel;

  if (!LOG_LEVELS.some((level) => level === logLevel)) {
    throw new Error(ERROR_MESSAGES.invalidLogLevel);
  }

  return Object.freeze({
    ...DEFAULTS,
    token,
    port: positiveInteger(env.PORT, DEFAULTS.port),
    host: env.HOST || DEFAULTS.host,
    renderTimeoutMs: positiveInteger(
      env.RENDER_TIMEOUT_MS,
      DEFAULTS.renderTimeoutMs,
    ),
    maxHtmlBytes: positiveInteger(env.MAX_HTML_BYTES, DEFAULTS.maxHtmlBytes),
    maxConcurrentRenders: positiveInteger(
      env.MAX_CONCURRENT_RENDERS,
      DEFAULTS.maxConcurrentRenders,
    ),
    maxRenderQueue: positiveInteger(
      env.MAX_RENDER_QUEUE,
      DEFAULTS.maxRenderQueue,
      { allowZero: true },
    ),
    logLevel: logLevel as LogLevel,
  });
}
