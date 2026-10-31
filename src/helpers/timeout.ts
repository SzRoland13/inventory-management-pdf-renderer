import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES, ServiceError } from '@/errors';

export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ServiceError(
            ErrorCode.RenderTimeout,
            ERROR_MESSAGES.renderTimeout,
            HttpStatus.GatewayTimeout,
          ),
        ),
      timeoutMs,
    );

    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
