import http from 'node:http';
import { createHttpApp } from '@/app';
import { loadConfig } from '@/config';
import { ERROR_MESSAGES } from '@/errors';
import { createLogger } from '@/logger';
import { LoggerEvent } from '@/enums/logger-event';
import { createRenderer } from '@/renderer';

export async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const renderer = createRenderer({
    timeoutMs: config.renderTimeoutMs,
    logger,
  });

  await renderer.start();

  const server = http.createServer(createHttpApp({ config, renderer, logger }));
  server.requestTimeout = config.renderTimeoutMs + 5_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.listen(config.port, config.host, () =>
    logger.info(LoggerEvent.ServerStarted, {
      host: config.host,
      port: config.port,
    }),
  );

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(LoggerEvent.ServerShuttingDown, { signal });
    server.close(async (error) => {
      if (error) {
        logger.error(LoggerEvent.HttpShutdownFailed, {
          errorName: error.name,
        });
      }

      try {
        await renderer.close();
      } catch (closeError) {
        logger.error(LoggerEvent.BrowserShutdownFailed, {
          errorName: closeError instanceof Error ? closeError.name : 'Error',
        });
      }

      process.exitCode = error ? 1 : 0;
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    const errorName = error instanceof Error ? error.name : 'Error';

    process.stderr.write(
      `${JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event: LoggerEvent.StartupFailed, errorName, message: ERROR_MESSAGES.generic })}\n`,
    );
    process.exitCode = 1;
  });
}
