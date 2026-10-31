import { chromium, type Browser, type BrowserContext } from 'playwright';
import { ERROR_MESSAGES, ErrorCode, HttpStatus, ServiceError } from '@/errors';
import { LoggerEvent, type Logger } from '@/logger';

const PAGE_FORMATS = new Set(['A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid']);
const MARGIN_KEYS = new Set(['top', 'right', 'bottom', 'left']);
const PDF_OPTION_KEYS = new Set([
  'format',
  'landscape',
  'margin',
  'displayHeaderFooter',
  'headerTemplate',
  'footerTemplate',
]);
const MAX_TEMPLATE_LENGTH = 32_768;
const MAX_MARGIN_VALUE = 1000;
const MARGIN_VALUE_PATTERN = /^\d+(?:\.\d+)?(?:mm|cm|in|px)$/;

export type PageFormat = 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
export type MarginSide = 'top' | 'right' | 'bottom' | 'left';

export interface PdfOptions {
  format?: PageFormat;
  landscape?: boolean;
  margin?: Partial<Record<MarginSide, string>>;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface Renderer {
  start(): Promise<Browser>;
  render(html: string, options?: unknown): Promise<Buffer>;
  close(): Promise<void>;
  isReady(): boolean;
}

interface RendererOptions {
  timeoutMs?: number;
  logger?: Logger;
  launch?: () => Promise<Browser>;
}

export function validatePdfOptions(input: unknown = undefined): PdfOptions {
  if (input === undefined) {
    return {};
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ServiceError(
      ErrorCode.InvalidOptions,
      ERROR_MESSAGES.invalidOptions,
      HttpStatus.BadRequest,
    );
  }

  const options = input as Record<string, unknown>;

  for (const key of Object.keys(options)) {
    if (!PDF_OPTION_KEYS.has(key)) {
      throw new ServiceError(
        ErrorCode.InvalidOptions,
        ERROR_MESSAGES.invalidOptions,
        HttpStatus.BadRequest,
      );
    }
  }

  if (
    options.format !== undefined &&
    !PAGE_FORMATS.has(options.format as string)
  ) {
    throw new ServiceError(
      ErrorCode.InvalidOptions,
      ERROR_MESSAGES.invalidOptions,
      HttpStatus.BadRequest,
    );
  }

  if (
    options.landscape !== undefined &&
    typeof options.landscape !== 'boolean'
  ) {
    throw new ServiceError(
      ErrorCode.InvalidOptions,
      ERROR_MESSAGES.invalidOptions,
      HttpStatus.BadRequest,
    );
  }

  if (
    options.displayHeaderFooter !== undefined &&
    typeof options.displayHeaderFooter !== 'boolean'
  ) {
    throw new ServiceError(
      ErrorCode.InvalidOptions,
      ERROR_MESSAGES.invalidOptions,
      HttpStatus.BadRequest,
    );
  }

  if (options.margin !== undefined) {
    if (
      !options.margin ||
      typeof options.margin !== 'object' ||
      Array.isArray(options.margin)
    ) {
      throw new ServiceError(
        ErrorCode.InvalidOptions,
        ERROR_MESSAGES.invalidOptions,
        HttpStatus.BadRequest,
      );
    }

    for (const [side, value] of Object.entries(options.margin)) {
      if (!MARGIN_KEYS.has(side)) {
        throw new ServiceError(
          ErrorCode.InvalidOptions,
          ERROR_MESSAGES.invalidOptions,
          HttpStatus.BadRequest,
        );
      }

      if (typeof value !== 'string' || !MARGIN_VALUE_PATTERN.test(value)) {
        throw new ServiceError(
          ErrorCode.InvalidOptions,
          ERROR_MESSAGES.invalidOptions,
          HttpStatus.BadRequest,
        );
      }

      const amount = Number.parseFloat(value);

      if (amount > MAX_MARGIN_VALUE) {
        throw new ServiceError(
          ErrorCode.InvalidOptions,
          ERROR_MESSAGES.invalidOptions,
          HttpStatus.BadRequest,
        );
      }
    }
  }

  for (const key of ['headerTemplate', 'footerTemplate']) {
    if (
      options[key] !== undefined &&
      (typeof options[key] !== 'string' ||
        options[key].length > MAX_TEMPLATE_LENGTH)
    ) {
      throw new ServiceError(
        ErrorCode.InvalidOptions,
        ERROR_MESSAGES.invalidOptions,
        HttpStatus.BadRequest,
      );
    }
  }

  if (
    (options.headerTemplate !== undefined ||
      options.footerTemplate !== undefined) &&
    options.displayHeaderFooter !== true
  ) {
    throw new ServiceError(
      ErrorCode.InvalidOptions,
      ERROR_MESSAGES.invalidOptions,
      HttpStatus.BadRequest,
    );
  }

  return options as PdfOptions;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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

export function createRenderer({
  timeoutMs = 15_000,
  logger = console,
  launch = () => chromium.launch({ headless: true }),
}: RendererOptions = {}): Renderer {
  let browser: Browser | undefined;
  let closing = false;
  let launchPromise: Promise<Browser> | undefined;

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
      context = await withTimeout(
        browser!.newContext({
          javaScriptEnabled: false,
          acceptDownloads: false,
        }),
        timeoutMs,
      );
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
      await context?.close().catch((error: unknown) =>
        logger.warn?.(LoggerEvent.ContextCloseFailed, {
          errorName: error instanceof Error ? error.name : 'Error',
        }),
      );
    }
  }

  async function close(): Promise<void> {
    closing = true;

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
