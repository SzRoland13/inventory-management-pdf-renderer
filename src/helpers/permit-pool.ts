import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES, ServiceError } from '@/errors';

export function createPermitPool(maxActive: number, maxQueued: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  return {
    async acquire(): Promise<void> {
      if (active < maxActive) {
        active += 1;

        return;
      }

      if (queue.length >= maxQueued) {
        throw new ServiceError(
          ErrorCode.CapacityExceeded,
          ERROR_MESSAGES.capacityExceeded,
          HttpStatus.ServiceUnavailable,
        );
      }
      await new Promise<void>((resolve) => queue.push(resolve));
    },
    release(): void {
      const next = queue.shift();

      if (next) {
        next();
      } else {
        active -= 1;
      }
    },
    get active(): number {
      return active;
    },
    get queued(): number {
      return queue.length;
    },
  };
}
