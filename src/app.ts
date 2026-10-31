import express, {
  type ErrorRequestHandler,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { ApiEndpoint, HealthStatus, HttpStatus } from '@/enums/api';
import { ErrorCode } from '@/enums/error-code';
import { ERROR_MESSAGES, ServiceError } from '@/errors';
import { requireBearerToken } from '@/helpers/auth';
import { createPermitPool } from '@/helpers/permit-pool';
import type { AppDependencies } from '@/types/app';
import type { Logger } from '@/types/logger';
import { LoggerEvent } from '@/enums/logger-event';

function addSecurityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}

function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, _next) => {
    if (response.headersSent) {
      return;
    }

    const parserError = error as { type?: string; status?: number };
    let normalized: ServiceError;

    if (parserError?.type === 'entity.too.large') {
      normalized = new ServiceError(
        ErrorCode.PayloadTooLarge,
        ERROR_MESSAGES.payloadTooLarge,
        HttpStatus.PayloadTooLarge,
      );
    } else if (
      error instanceof SyntaxError &&
      parserError.status === HttpStatus.BadRequest
    ) {
      normalized = new ServiceError(
        ErrorCode.InvalidJson,
        ERROR_MESSAGES.invalidJson,
        HttpStatus.BadRequest,
      );
    } else if (error instanceof ServiceError) {
      normalized = error;
    } else {
      normalized = new ServiceError(
        ErrorCode.InternalError,
        ERROR_MESSAGES.generic,
        HttpStatus.InternalServerError,
      );
    }

    logger.warn?.(LoggerEvent.RequestFailed, {
      method: request.method,
      path: request.path,
      code: normalized.code,
      status: normalized.status,
    });

    response.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message,
      },
    });
  };
}

export function createApp({
  config,
  renderer,
  logger = console,
}: AppDependencies) {
  const app = express();
  const permits = createPermitPool(
    config.maxConcurrentRenders,
    config.maxRenderQueue,
  );

  app.disable('x-powered-by');
  app.use(addSecurityHeaders);

  app.get(ApiEndpoint.HealthLive, (_request, response) => {
    response.status(HttpStatus.Ok).json({ status: HealthStatus.Ok });
  });

  app.get(ApiEndpoint.HealthReady, (_request, response) => {
    if (!renderer.isReady()) {
      response.status(HttpStatus.ServiceUnavailable).json({
        status: HealthStatus.NotReady,
      });

      return;
    }

    response.status(HttpStatus.Ok).json({ status: HealthStatus.Ready });
  });

  app.post(
    ApiEndpoint.Render,
    requireBearerToken(config),
    async (request, response, next) => {
      const abortController = new AbortController();
      const abortOnClose = () => {
        if (!response.writableEnded) {
          abortController.abort();
        }
      };
      response.on('close', abortOnClose);

      try {
        if (!request.is('application/json')) {
          response.status(HttpStatus.UnsupportedMediaType).json({
            error: {
              code: ErrorCode.UnsupportedMediaType,
              message: ERROR_MESSAGES.unsupportedMediaType,
            },
          });

          return;
        }

        const { html, options } = request.body || {};

        if (typeof html !== 'string' || html.length === 0) {
          response.status(HttpStatus.BadRequest).json({
            error: {
              code: ErrorCode.InvalidRequest,
              message: ERROR_MESSAGES.invalidRequest,
            },
          });

          return;
        }

        await permits.acquire(abortController.signal);

        if (abortController.signal.aborted) {
          permits.release();

          return;
        }
        const startedAt = Date.now();
        let pdf: Buffer;

        try {
          pdf = await renderer.render(html, options);
        } finally {
          permits.release();
        }

        logger.info?.(LoggerEvent.RenderCompleted, {
          durationMs: Date.now() - startedAt,
          pdfBytes: pdf.length,
        });

        response
          .status(HttpStatus.Ok)
          .type('application/pdf')
          .set('Content-Disposition', 'inline; filename="rendered.pdf"')
          .send(pdf);
      } catch (error) {
        if (!abortController.signal.aborted) {
          next(error);
        }
      } finally {
        response.off('close', abortOnClose);
      }
    },
  );

  app.use(createErrorHandler(logger));
  app.use((_request, response) => {
    response.status(HttpStatus.NotFound).json({
      error: {
        code: ErrorCode.NotFound,
        message: ERROR_MESSAGES.notFound,
      },
    });
  });

  return app;
}

export function createHttpApp({
  config,
  renderer,
  logger = console,
}: AppDependencies) {
  const app = express();

  app.use(addSecurityHeaders);
  app.use(ApiEndpoint.Render, requireBearerToken(config));
  app.use(
    express.json({
      limit: config.maxHtmlBytes,
      strict: true,
      type: 'application/json',
    }),
  );
  app.use(createApp({ config, renderer, logger }));
  app.use(createErrorHandler(logger));

  return app;
}
