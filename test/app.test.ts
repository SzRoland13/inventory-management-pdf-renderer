import assert from 'node:assert/strict';
import http from 'node:http';
import test, { type TestContext } from 'node:test';
import { createHttpApp } from '@/app';
import { loadConfig, type ServiceConfig } from '@/config';
import {
  ApiEndpoint,
  ERROR_MESSAGES,
  ErrorCode,
  HealthStatus,
  HttpStatus,
  ServiceError,
} from '@/errors';
import { validatePdfOptions } from '@/renderer';
import type { Renderer } from '@/renderer';

const TOKEN = 'local-development-secret-that-is-at-least-32-characters';
const silentLogger = { debug() {}, info() {}, warn() {}, error() {} };

interface ServerOptions {
  renderer?: Pick<Renderer, 'isReady' | 'render'>;
  config?: Partial<ServiceConfig>;
}

async function withServer(
  t: TestContext,
  { renderer, config = {} }: ServerOptions = {},
): Promise<string> {
  const serviceConfig: ServiceConfig = {
    ...loadConfig({ RENDERER_API_TOKEN: TOKEN }),
    maxHtmlBytes: 128,
    maxConcurrentRenders: 1,
    maxRenderQueue: 0,
    ...config,
  };
  const server = http.createServer(
    createHttpApp({
      config: serviceConfig,
      renderer: renderer || {
        isReady: () => true,
        render: async () => Buffer.from('%PDF-1.7'),
      },
      logger: silentLogger,
    }),
  );

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error(ERROR_MESSAGES.generic);
  }

  return `http://127.0.0.1:${address.port}`;
}

function renderRequest(
  baseUrl: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${baseUrl}${ApiEndpoint.Render}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
      ...headers,
    },
    body,
  });
}

test('valid render request returns PDF bytes and versioned contract headers', async (t) => {
  let received: { html: string; options: unknown } | undefined;
  const baseUrl = await withServer(t, {
    renderer: {
      isReady: () => true,
      render: async (html, options) => {
        received = { html, options };

        return Buffer.from('%PDF-1.7 test');
      },
    },
  });
  const response = await renderRequest(
    baseUrl,
    JSON.stringify({
      html: '<h1>Hello</h1>',
      options: { format: 'A4', landscape: true },
    }),
  );

  assert.equal(response.status, HttpStatus.Ok);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '%PDF-1.7 test');
  assert.deepEqual(received, {
    html: '<h1>Hello</h1>',
    options: { format: 'A4', landscape: true },
  });
});

test('unauthenticated requests are rejected before parsing or rendering', async (t) => {
  let called = false;
  const baseUrl = await withServer(t, {
    renderer: {
      isReady: () => true,
      render: async () => {
        called = true;

        return Buffer.from('pdf');
      },
    },
  });
  const response = await renderRequest(baseUrl, '{bad json', {
    authorization: 'Bearer invalid',
  });
  const body = await response.json();

  assert.equal(response.status, HttpStatus.Unauthorized);
  assert.equal(body.error.code, ErrorCode.Unauthorized);
  assert.equal(body.error.message, ERROR_MESSAGES.unauthorized);
  assert.equal(called, false);
});

test('malformed and oversized JSON use structured message keys', async (t) => {
  const baseUrl = await withServer(t);
  const malformed = await renderRequest(baseUrl, '{');
  const malformedBody = await malformed.json();

  assert.equal(malformed.status, HttpStatus.BadRequest);
  assert.equal(malformedBody.error.code, ErrorCode.InvalidJson);
  assert.equal(malformedBody.error.message, ERROR_MESSAGES.invalidJson);

  const oversized = await renderRequest(
    baseUrl,
    JSON.stringify({ html: 'x'.repeat(256) }),
  );
  const oversizedBody = await oversized.json();

  assert.equal(oversized.status, HttpStatus.PayloadTooLarge);
  assert.equal(oversizedBody.error.code, ErrorCode.PayloadTooLarge);
  assert.equal(oversizedBody.error.message, ERROR_MESSAGES.payloadTooLarge);
});

test('missing HTML and unsupported media type return client errors', async (t) => {
  const baseUrl = await withServer(t);
  const missing = await renderRequest(baseUrl, JSON.stringify({ options: {} }));
  const missingBody = await missing.json();

  assert.equal(missing.status, HttpStatus.BadRequest);
  assert.equal(missingBody.error.code, ErrorCode.InvalidRequest);
  assert.equal(missingBody.error.message, ERROR_MESSAGES.invalidRequest);

  const unsupported = await fetch(`${baseUrl}${ApiEndpoint.Render}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'text/plain',
    },
    body: 'html',
  });
  const unsupportedBody = await unsupported.json();

  assert.equal(unsupported.status, HttpStatus.UnsupportedMediaType);
  assert.equal(unsupportedBody.error.code, ErrorCode.UnsupportedMediaType);
  assert.equal(
    unsupportedBody.error.message,
    ERROR_MESSAGES.unsupportedMediaType,
  );
});

test('renderer errors use stable localization keys', async (t) => {
  const baseUrl = await withServer(t, {
    renderer: {
      isReady: () => true,
      render: async () => {
        throw new ServiceError(
          ErrorCode.RenderTimeout,
          ERROR_MESSAGES.renderTimeout,
          HttpStatus.GatewayTimeout,
        );
      },
    },
  });
  const response = await renderRequest(
    baseUrl,
    JSON.stringify({ html: '<p>ok</p>' }),
  );

  assert.equal(response.status, HttpStatus.GatewayTimeout);
  assert.deepEqual((await response.json()).error, {
    code: ErrorCode.RenderTimeout,
    message: ERROR_MESSAGES.renderTimeout,
  });
});

test('full render capacity returns a retryable error', async (t) => {
  let beginRender!: () => void;
  let finishRender!: () => void;
  const rendering = new Promise<void>((resolve) => {
    finishRender = resolve;
  });
  const started = new Promise<void>((resolve) => {
    beginRender = resolve;
  });
  const baseUrl = await withServer(t, {
    renderer: {
      isReady: () => true,
      render: async () => {
        beginRender();
        await rendering;

        return Buffer.from('pdf');
      },
    },
  });
  const firstRequest = renderRequest(
    baseUrl,
    JSON.stringify({ html: '<p>first</p>' }),
  );

  await started;

  const secondResponse = await renderRequest(
    baseUrl,
    JSON.stringify({ html: '<p>second</p>' }),
  );
  const secondBody = await secondResponse.json();

  assert.equal(secondResponse.status, HttpStatus.ServiceUnavailable);
  assert.equal(secondBody.error.code, ErrorCode.CapacityExceeded);
  assert.equal(secondBody.error.message, ERROR_MESSAGES.capacityExceeded);
  finishRender();
  assert.equal((await firstRequest).status, 200);
});

test('readiness reports whether Chromium is available', async (t) => {
  const baseUrl = await withServer(t, {
    renderer: { isReady: () => false, render: async () => Buffer.from('pdf') },
  });
  const response = await fetch(`${baseUrl}${ApiEndpoint.HealthReady}`);

  assert.equal(response.status, HttpStatus.ServiceUnavailable);
  assert.deepEqual(await response.json(), {
    status: HealthStatus.NotReady,
  });
});

test('PDF options reject unsupported settings and unsafe dimensions', () => {
  assert.throws(
    () => validatePdfOptions({ scale: 3 }),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.code === ErrorCode.InvalidOptions &&
      error.message === ERROR_MESSAGES.invalidOptions,
  );
  assert.throws(
    () => validatePdfOptions({ format: 'Custom' }),
    (error: unknown) =>
      error instanceof ServiceError && error.code === ErrorCode.InvalidOptions,
  );
  assert.throws(
    () => validatePdfOptions({ margin: { top: '1001mm' } }),
    (error: unknown) =>
      error instanceof ServiceError && error.code === ErrorCode.InvalidOptions,
  );
  assert.throws(
    () => validatePdfOptions({ headerTemplate: '<b>Header</b>' }),
    (error: unknown) =>
      error instanceof ServiceError && error.code === ErrorCode.InvalidOptions,
  );
});

test('configuration requires a strong token and validates bounded settings', () => {
  assert.throws(
    () => loadConfig({ RENDERER_API_TOKEN: 'short' }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === ERROR_MESSAGES.configTokenRequired,
  );
  const config = loadConfig({
    RENDERER_API_TOKEN: TOKEN,
    MAX_CONCURRENT_RENDERS: '2',
    MAX_RENDER_QUEUE: '0',
  });

  assert.equal(config.maxConcurrentRenders, 2);
  assert.equal(config.maxRenderQueue, 0);
  assert.throws(
    () => loadConfig({ RENDERER_API_TOKEN: TOKEN, RENDER_TIMEOUT_MS: '-1' }),
    (error: unknown) =>
      error instanceof Error && error.message === ERROR_MESSAGES.invalidInteger,
  );
});

test('PDF size limit accepts the boundary and rejects larger output without leaking bytes', async (t) => {
  let size = 8;
  const baseUrl = await withServer(t, {
    config: { maxPdfBytes: 8 },
    renderer: {
      isReady: () => true,
      render: async () => Buffer.alloc(size, 'x'),
    },
  });
  const request = () =>
    renderRequest(baseUrl, JSON.stringify({ html: '<p>test</p>' }));
  assert.equal((await request()).status, 200);
  size = 9;
  const oversized = await request();
  assert.equal(oversized.status, 413);
  assert.deepEqual(await oversized.json(), {
    error: { code: ErrorCode.PdfTooLarge, message: ERROR_MESSAGES.pdfTooLarge },
  });
  size = 8;
  assert.equal((await request()).status, 200);
  assert.equal(
    loadConfig({ RENDERER_API_TOKEN: TOKEN, MAX_PDF_BYTES: '8' }).maxPdfBytes,
    8,
  );
  assert.throws(() =>
    loadConfig({ RENDERER_API_TOKEN: TOKEN, MAX_PDF_BYTES: '0' }),
  );
});
