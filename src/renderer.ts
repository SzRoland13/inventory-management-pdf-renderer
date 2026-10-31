import { chromium, type Browser, type BrowserContext } from 'playwright';
import { ErrorCode } from '@/enums/error-code';
import { HttpStatus } from '@/enums/api';
import { ERROR_MESSAGES, ServiceError } from '@/errors';
import { validatePdfOptions } from '@/helpers/pdf-options';
import { withTimeout } from '@/helpers/timeout';
import { LoggerEvent } from '@/enums/logger-event';
import type { Renderer, RendererOptions } from '@/types/renderer';
export { validatePdfOptions } from '@/helpers/pdf-options';
export type { PdfOptions } from '@/types/pdf';
export type { Renderer } from '@/types/renderer';

export function createRenderer({
  timeoutMs = 15_000,
  logger = console,
  launch = () => chromium.launch({ headless: true }),
}: RendererOptions = {}): Renderer {
  let browser: Browser | undefined;
  let closing = false;
  let launchPromise: Promise<Browser> | undefined;
  let recoveryTimer: NodeJS.Timeout | undefined;
  let recoveryAttempts = 0;

  function scheduleRecovery(delayMs = 1000): void {
    if (closing || recoveryAttempts >= 5 || recoveryTimer) {
      return;
    }

    recoveryTimer = setTimeout(() => {
      recoveryTimer = undefined;
      recoveryAttempts += 1;
      void start()
        .then(() => {
          recoveryAttempts = 0;
        })
        .catch(() =>
          scheduleRecovery(Math.min(1000 * 2 ** recoveryAttempts, 10_000)),
        );
    }, delayMs);
    recoveryTimer.unref?.();
  }

  async function start(): Promise<Browser> {
    if (browser?.isConnected()) {
      return browser;
    }

    if (!launchPromise) {
      launchPromise = Promise.resolve()
        .then(launch)
        .then((nextBrowser) => {
          browser = nextBrowser;
          nextBrowser.on('disconnected', () => {
            if (browser === nextBrowser) {
              browser = undefined;
              launchPromise = undefined;

              scheduleRecovery();
            }
          });

          return nextBrowser;
        })
        .catch((error: unknown) => {
          launchPromise = undefined;
          throw error;
        });
    }

    return launchPromise;
  }

  async function render(
    html: string,
    rawOptions: unknown = undefined,
  ): Promise<Buffer> {
    const options = validatePdfOptions(rawOptions);

    if (closing) {
      throw new ServiceError(
        ErrorCode.RendererUnavailable,
        ERROR_MESSAGES.rendererUnavailable,
        HttpStatus.ServiceUnavailable,
      );
    }

    if (!browser?.isConnected()) {
      try {
        await start();
      } catch (error) {
        logger.error?.(LoggerEvent.BrowserLaunchFailed, {
          errorName: error instanceof Error ? error.name : 'Error',
        });

        throw new ServiceError(
          ErrorCode.RendererUnavailable,
          ERROR_MESSAGES.rendererUnavailable,
          HttpStatus.ServiceUnavailable,
        );
      }
    }

    let context: BrowserContext | undefined;

    try {
      const contextPromise = browser!.newContext({
        javaScriptEnabled: false,
        acceptDownloads: false,
      });
      try {
        context = await withTimeout(contextPromise, timeoutMs);
      } catch (error) {
        if (
          error instanceof ServiceError &&
          error.code === ErrorCode.RenderTimeout
        ) {
          void contextPromise
            .then((lateContext) => lateContext.close())
            .catch(() => undefined);
        }
        throw error;
      }
      await withTimeout(
        context.route('**/*', async (route) => {
          const url = route.request().url();

          if (url.startsWith('data:') || url === 'about:blank') {
            return route.continue();
          }

          return route.abort('blockedbyclient');
        }),
        timeoutMs,
      );
      const page = await withTimeout(context.newPage(), timeoutMs);
      const pdfPromise = (async () => {
        await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });

        return page.pdf({
          format: options.format || 'A4',
          landscape: options.landscape || false,
          margin: options.margin,
          displayHeaderFooter: options.displayHeaderFooter || false,
          headerTemplate: options.headerTemplate,
          footerTemplate: options.footerTemplate,
          printBackground: true,
          preferCSSPageSize: false,
        });
      })();

      return await withTimeout(pdfPromise, timeoutMs);
    } catch (error) {
      if (error instanceof ServiceError) {
        throw error;
      }

      logger.error?.(LoggerEvent.RenderFailed, {
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw new ServiceError(
        ErrorCode.RenderFailed,
        ERROR_MESSAGES.renderFailed,
      );
    } finally {
      if (context) {
        try {
          await withTimeout(context.close(), timeoutMs);
        } catch (error) {
          logger.warn?.(LoggerEvent.ContextCloseFailed, {
            errorName: error instanceof Error ? error.name : 'Error',
          });

          if (
            error instanceof ServiceError &&
            error.code === ErrorCode.RenderTimeout
          ) {
            void browser?.close().catch(() => undefined);
            browser = undefined;
          }
        }
      }
    }
  }

  async function close(): Promise<void> {
    closing = true;

    if (recoveryTimer) {
      clearTimeout(recoveryTimer);
    }

    if (launchPromise) {
      try {
        await launchPromise;
      } catch {
        return;
      }
    }

    await browser?.close();
    browser = undefined;
  }

  return {
    start,
    render,
    close,
    isReady: () => Boolean(browser?.isConnected()) && !closing,
  };
}
