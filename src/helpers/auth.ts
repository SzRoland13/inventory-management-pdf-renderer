import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES } from '@/errors';
import type { ServiceConfig } from '@/types/service-config';

const BEARER_AUTHORIZATION_PATTERN = /^Bearer ([^\s]+)$/;

export function safeTokenEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

export function requireBearerToken(config: ServiceConfig): RequestHandler {
  return (request, response, next) => {
    const authorization = request.get('authorization') || '';
    const match = BEARER_AUTHORIZATION_PATTERN.exec(authorization);

    if (!match || !safeTokenEqual(config.token, match[1])) {
      response.status(HttpStatus.Unauthorized).json({
        error: {
          code: ErrorCode.Unauthorized,
          message: ERROR_MESSAGES.unauthorized,
        },
      });

      return;
    }
    next();
  };
}
