# PDF Renderer

PDF Renderer is a small, stateless HTTP service that turns caller-supplied HTML into PDF documents. It is designed to run alongside backend applications that need browser-quality output for invoices, reports, labels, statements, and other printable documents.

The service accepts a complete HTML document, renders it in headless Chromium through Playwright, and returns the generated PDF bytes in the response. It has no knowledge of the caller's business domain: it does not fetch records, build templates, store jobs or PDFs, or connect to application databases. The caller owns document data, HTML generation, persistence, and any retry policy.

## How it works

The Node.js 22+ application is written in TypeScript and uses Express for HTTP handling and Playwright to control Chromium. At startup it validates configuration, starts the browser, and then begins listening for requests. Each render receives an isolated browser context with JavaScript disabled. The renderer allows only `data:` and `about:blank` browser requests, so documents must include their required assets inline and cannot load remote resources or local files.

Requests pass through bearer-token authentication, JSON parsing and size limits, input validation, and a bounded concurrency queue before reaching Chromium. A render deadline covers browser startup and page generation. The browser context is closed after each request; if Chromium disconnects, the service attempts to recover it. On shutdown, the HTTP server stops accepting connections and the browser is closed.

The service is stateless between requests. It does not retain submitted HTML or generated PDFs. Structured logs report operational events, durations, byte counts, and error codes without recording HTML or the bearer token.

## Run locally

Requirements: Node.js 22 or newer and the Chromium build matching the pinned Playwright dependency.

```sh
npm ci
npx playwright install --with-deps chromium
cp .env.example .env
# Set RENDERER_API_TOKEN to a random secret of at least 32 characters.
npm run build
npm start
```

The server listens on `0.0.0.0:3000` by default. Configure it with environment variables (see [Configuration](#configuration)). The `start` script loads `.env` when present.

## Render API

### `POST /api/v1/render`

Requires `Authorization: Bearer <token>` and `Content-Type: application/json`. The JSON body must contain a non-empty `html` string. An optional `options` object controls the printed page.

```json
{
  "html": "<!doctype html><html><body><h1>Invoice 123</h1></body></html>",
  "options": {
    "format": "A4",
    "landscape": false,
    "margin": {
      "top": "12mm",
      "right": "10mm",
      "bottom": "12mm",
      "left": "10mm"
    },
    "displayHeaderFooter": true,
    "headerTemplate": "<div style=\"font-size:8px;width:100%;text-align:center\">Invoice</div>",
    "footerTemplate": "<div style=\"font-size:8px;width:100%;text-align:center\"><span class=\"pageNumber\"></span> / <span class=\"totalPages\"></span></div>"
  }
}
```

Supported options:

- `format`: `A3`, `A4`, `A5`, `Letter`, `Legal`, or `Tabloid`; Chromium defaults to A4.
- `landscape`: boolean page orientation.
- `margin`: optional `top`, `right`, `bottom`, and `left` values, each using `mm`, `cm`, `in`, or `px` and no more than 1000 units.
- `displayHeaderFooter`: boolean. Must be `true` when supplying either template.
- `headerTemplate` and `footerTemplate`: optional strings up to 32 KiB each. Chromium supports placeholders such as `pageNumber` and `totalPages` through template classes.

Unknown option names and invalid values are rejected. Chromium prints backgrounds. A successful response is `200 application/pdf` with an inline filename of `rendered.pdf`; callers should save the response body as binary data.

### Errors

Failures use a JSON envelope and an HTTP status appropriate to the error:

```json
{ "error": { "code": "RENDER_TIMEOUT", "message": "error.renderTimeout" } }
```

The `message` field is a localization key, not user-facing prose. Applications can map it to localized text. Common codes include `UNAUTHORIZED`, `UNSUPPORTED_MEDIA_TYPE`, `INVALID_REQUEST`, `INVALID_OPTIONS`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `PDF_TOO_LARGE`, `CAPACITY_EXCEEDED`, `RENDERER_UNAVAILABLE`, `RENDER_TIMEOUT`, `RENDER_FAILED`, `INTERNAL_ERROR`, and `NOT_FOUND`. Error responses do not include submitted HTML or browser internals.

An HTML body over the configured request limit or a generated PDF over the output limit returns `413`. A full render queue returns `CAPACITY_EXCEEDED`; transient capacity, timeout, and renderer availability errors may be retried by the caller using a bounded retry policy. `PDF_TOO_LARGE` is checked after Chromium has generated the output, so it limits response size but does not cap memory used during generation.

## Health endpoints

- `GET /health/live` returns `200` while the process is responding.
- `GET /health/ready` returns `200` after Chromium is connected, or `503` while the renderer is unavailable.

Health endpoints do not require authentication. Use liveness to detect a stuck or stopped process and readiness to decide whether it can accept render traffic.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | HTTP listening port. |
| `HOST` | `0.0.0.0` | HTTP listening interface. |
| `RENDERER_API_TOKEN` | Required | Bearer token; must contain at least 32 characters. |
| `RENDER_TIMEOUT_MS` | `15000` | Maximum time allowed for a render. |
| `MAX_HTML_BYTES` | `1048576` | Maximum JSON request body size (1 MiB by default). |
| `MAX_PDF_BYTES` | `10485760` | Maximum returned PDF size (10 MiB by default). |
| `MAX_CONCURRENT_RENDERS` | `4` | Maximum renders executing at once. |
| `MAX_RENDER_QUEUE` | `16` | Maximum requests waiting for a render permit; zero disables waiting. |
| `LOG_LEVEL` | `info` | Log threshold: `debug`, `info`, `warn`, or `error`. |

Numeric limits must be positive whole numbers, except `MAX_RENDER_QUEUE`, which may be zero. The API token must be provided at startup.

## Security and deployment

The render endpoint is protected by a shared bearer token. Keep it in a deployment secret manager, rotate it when needed, and expose the service only to trusted workloads over a network protected by TLS. The service does not render JavaScript and blocks network and `file:` access from the browser. Embed images and fonts using `data:` URLs. Avoid including credentials or sensitive content that should not appear in the generated document.

The Docker image uses the Playwright base image matching the pinned Playwright package, compiles the TypeScript in a build stage, and runs the compiled service as the non-root `pwuser` account. Apply CPU, memory, and process limits in the deployment platform. For example:

```sh
docker build -t pdf-renderer .
docker run --rm --memory=1g --memory-swap=1g --cpus=2 --pids-limit=256 -p 3000:3000 \
  -e RENDERER_API_TOKEN="$RENDERER_API_TOKEN" \
  pdf-renderer
```

The default PDF size limit is 10 MiB, but that limit is applied after generation and does not bound Chromium's peak memory. Tune render concurrency and resource limits with representative documents. Configure restart handling for container failures and keep caller retries bounded.

## Integrating with a backend

For asynchronous document generation, call the renderer from a background worker. Send the document HTML and explicit PDF options, then persist the binary body returned on `200` against the owning business record. Parse both `error.code` and `error.message` on failures and apply the worker's retry policy to transient errors. The renderer itself does not create jobs, retain results, or access application data.

## Development commands

```sh
npm run build             # Compile TypeScript and rewrite import aliases
npm test                  # Build and run API and renderer unit tests
npm run test:integration  # Build and exercise Chromium (requires installed browser)
npm run lint              # Run ESLint
npm run format:check      # Check formatting
npm run check             # Lint, formatting check, build, and unit tests
npm run format            # Format source, tests, and Markdown
npm run lint:fix          # Apply ESLint fixes
```
