import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES, ServiceError } from '@/errors';

export function createPermitPool(maxActive: number, maxQueued: number) {
  let active = 0;
  type Waiter = {
    resolve: () => void;
    reject: (error: Error) => void;
    signal?: AbortSignal;
    onAbort?: () => void;
  };
  const queue: Waiter[] = [];

  return {
    async acquire(signal?: AbortSignal): Promise<void> {
      if (signal?.aborted) {
        throw new Error('Permit acquisition aborted');
      }

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
      await new Promise<void>((resolve, reject) => {
        const waiter: Waiter = { resolve, reject, signal };
        waiter.onAbort = () => {
          const index = queue.indexOf(waiter);

          if (index !== -1) {
            queue.splice(index, 1);
            reject(new Error('Permit acquisition aborted'));
          }
        };
        signal?.addEventListener('abort', waiter.onAbort, { once: true });
        queue.push(waiter);

        // Cover aborts that occur between the initial check and listener setup.
        if (signal?.aborted) {
          waiter.onAbort?.();
        }
      });
    },
    release(): void {
      const next = queue.shift();

      if (next) {
        if (next.onAbort) {
          next.signal?.removeEventListener('abort', next.onAbort);
        }
        next.resolve();
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
