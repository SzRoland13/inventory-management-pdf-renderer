import assert from 'node:assert/strict';
import test from 'node:test';
import type { Browser, BrowserContextOptions, Route } from 'playwright';
import { ERROR_MESSAGES, ErrorCode, HttpStatus, ServiceError } from '@/errors';
import { createRenderer } from '@/renderer';

test('renderer disables JavaScript and blocks all non-inline resources', async () => {
  let contextOptions: BrowserContextOptions | undefined;
  let routeHandler: ((route: Route) => Promise<void>) | undefined;
  let contextClosed = false;
  let browserClosed = false;
  const browser = {
    async close() {
      browserClosed = true;
    },
    isConnected: () => true,
    on: () => browser,
    async newContext(options: BrowserContextOptions) {
      contextOptions = options;

      return {
        async route(
          _pattern: string,
          handler: (route: Route) => Promise<void>,
        ) {
          routeHandler = handler;
        },
        async newPage() {
          return {
            async setContent() {},
            async pdf() {
              return Buffer.from('%PDF-1.7');
            },
          };
        },
        async close() {
          contextClosed = true;
        },
      };
    },
  } as unknown as Browser;
  const renderer = createRenderer({
    launch: async () => browser,
    logger: { error() {}, warn() {} },
  });

  await renderer.start();

  const pdf = await renderer.render('<h1>Safe HTML</h1>');

  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(contextOptions?.javaScriptEnabled, false);

  for (const url of ['https://example.com/image.png', 'file:///etc/passwd']) {
    let aborted = false;

    await routeHandler?.({
      request: () => ({ url: () => url }),
      abort: async (reason: string) => {
        aborted = reason === 'blockedbyclient';
      },
    } as unknown as Route);

    assert.equal(aborted, true, `${url} should be blocked`);
  }

  let continued = false;

  await routeHandler?.({
    request: () => ({ url: () => 'data:image/png;base64,AAAA' }),
    continue: async () => {
      continued = true;
    },
  } as unknown as Route);

  assert.equal(continued, true);
  await renderer.close();
  assert.equal(contextClosed, true);
  assert.equal(browserClosed, true);
});

test('browser launch failures return a retryable renderer error', async () => {
  const renderer = createRenderer({
    launch: async () => {
      throw new Error('Chromium launch details must not reach the caller.');
    },
    logger: { error() {} },
  });

  await assert.rejects(
    renderer.render('<h1>Unavailable</h1>'),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.code === ErrorCode.RendererUnavailable &&
      error.status === HttpStatus.ServiceUnavailable &&
      error.message === ERROR_MESSAGES.rendererUnavailable,
  );
});

test('an older waiter timeout cannot invalidate a replacement launch', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  const launches: Array<(browser: Browser) => void> = [];
  let closed = 0;
  const browser = {
    isConnected: () => true,
    on() {
      return this;
    },
    async close() {
      closed += 1;
    },
    async newContext() {
      return {
        async route() {},
        async close() {},
        async newPage() {
          return {
            async setContent() {},
            async pdf() {
              return Buffer.from('%PDF-1.7');
            },
          };
        },
      };
    },
  } as unknown as Browser;
  const renderer = createRenderer({
    timeoutMs: 100,
    launch: () => new Promise<Browser>((resolve) => launches.push(resolve)),
  });
  t.after(() => renderer.close());
  const first = assert.rejects(renderer.render('first'), {
    code: ErrorCode.RenderTimeout,
  });
  await flush();
  t.mock.timers.tick(25);
  const second = assert.rejects(renderer.render('second'), {
    code: ErrorCode.RenderTimeout,
  });
  await flush();
  t.mock.timers.tick(75);
  await first;
  const replacement = renderer.render('replacement');
  await flush();
  assert.equal(launches.length, 2);
  t.mock.timers.tick(25);
  await second;
  launches[1](browser);
  assert.equal((await replacement).toString(), '%PDF-1.7');
  assert.equal(closed, 0);
  // A late result from the abandoned launch is disposed without affecting readiness.
  let abandonedClosed = false;
  launches[0]({
    async close() {
      abandonedClosed = true;
    },
  } as unknown as Browser);
  await flush();
  assert.equal(abandonedClosed, true);
  assert.equal(closed, 0);
  assert.equal(renderer.isReady(), true);
});
