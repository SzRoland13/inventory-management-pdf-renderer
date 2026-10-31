# PDF Renderer

Standalone HTML-to-PDF service for the Inventory Management platform. It uses Node.js, TypeScript, Express, Playwright, and Chromium. Source imports use the `@/*` alias configured in `tsconfig.json`; the build rewrites aliases so compiled JavaScript runs directly in Node.js. It has no connection to Inventory Management business data or persistence.

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

The service listens on port 3000 by default. Set the environment variables in `.env.example` to configure the listener, credentials, timeouts, payload size, concurrency, and queue size. Keep the bearer token secret and expose the service only on a trusted internal network protected by TLS.

## API v1

`POST /api/v1/render` requires `Authorization: Bearer <token>` and `Content-Type: application/json`.

Example request:

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

Supported page formats are `A3`, `A4`, `A5`, `Letter`, `Legal`, and `Tabloid`. Margins use `mm`, `cm`, `in`, or `px`, up to 1000 units each. Header/footer templates are optional strings up to 32 KiB; enable `displayHeaderFooter` to use them. Chromium prints backgrounds. Responses are raw PDF bytes (`application/pdf`) with an inline `rendered.pdf` filename.

Errors use this JSON shape and a matching HTTP status:

```json
{ "error": { "code": "RENDER_TIMEOUT", "message": "error.renderTimeout" } }
```

Error `message` values are localization keys defined in `src/errors.ts`; they are not prose. Callers can map them to localized text. The common code-to-key pairs are `UNAUTHORIZED` → `error.unauthorized`, `UNSUPPORTED_MEDIA_TYPE` → `error.unsupportedMediaType`, `INVALID_REQUEST` → `error.invalidRequest`, `INVALID_OPTIONS` → `error.invalidOptions`, `INVALID_JSON` → `error.invalidJson`, `PAYLOAD_TOO_LARGE` → `error.payloadTooLarge`, `CAPACITY_EXCEEDED` → `error.capacityExceeded`, `RENDERER_UNAVAILABLE` → `error.rendererUnavailable`, `RENDER_TIMEOUT` → `error.renderTimeout`, `RENDER_FAILED` → `error.renderFailed`, `INTERNAL_ERROR` → `error.generic`, and `NOT_FOUND` → `error.notFound`. Error responses do not include submitted HTML or browser internals.

The default HTML request limit is 1 MiB. A render has a 15-second timeout, with four active renders and up to 16 waiting requests by default. A full queue returns `CAPACITY_EXCEEDED`; callers can retry transient capacity or renderer failures. Limits are configurable through environment variables.

### Input security

Submit complete HTML and CSS. JavaScript is disabled. Embed required images or fonts with `data:` URLs. The renderer blocks every browser request except `data:` and `about:blank`, including external network URLs and `file:` URLs. Do not include credentials or sensitive data in HTML that should not be rendered. Logs record operational events and error codes only; they never include HTML or the bearer token.

## Health checks

- `GET /health/live` returns `200` while the process responds.
- `GET /health/ready` returns `200` after Chromium starts, otherwise `503`.

Neither endpoint requires authentication. The process handles `SIGTERM` and `SIGINT` by closing HTTP connections and Chromium.

## Container

The Docker image compiles TypeScript in a build stage and runs only compiled JavaScript with production dependencies. The official Playwright base image matches the pinned package version and includes Chromium.

```sh
docker build -t inventory-management-pdf-renderer .
docker run --rm -p 3000:3000 \
  -e RENDERER_API_TOKEN="$RENDERER_API_TOKEN" \
  inventory-management-pdf-renderer
```

Provide the token from a deployment secret manager. Terminate TLS at the internal ingress or service mesh, and restrict network access to authorized backend workloads.

## Backend integration

IM-71 should call this endpoint from its background PDF worker, not from the business request path. Send the document HTML and explicit PDF options as JSON. On `200`, persist the response body as the generated PDF for the owning document. On an error, parse `error.code` and `error.message`; retry transient timeout, capacity, or service-unavailable responses according to the worker's bounded retry policy. The renderer does not create jobs, retain PDFs, or access document data.

## Checks

```sh
npm run check            # ESLint, Prettier check, TypeScript build, and API tests
npm run format           # Apply Prettier formatting
npm run lint:fix         # Apply ESLint auto-fixes
npm run build            # Compile TypeScript and rewrite path aliases for Node.js
npm test                 # Build, then API, validation, and configuration tests
npm run test:integration # Build and start Chromium; requires installed Playwright Chromium
```
