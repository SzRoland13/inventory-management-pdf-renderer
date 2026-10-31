import type { LogLevel } from '@/types/log-level';
import type { Logger } from '@/types/logger';
import { LoggerEvent } from '@/enums/logger-event';
export { LoggerEvent } from '@/enums/logger-event';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type { Logger } from '@/types/logger';

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
