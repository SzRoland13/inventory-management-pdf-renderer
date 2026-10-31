import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { createRenderer } from '@/renderer';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=',
  'base64',
);

test('Chromium blocks reachable network and existing local assets while allowing inline assets', async (t) => {
  let hits = 0;
  const server = http.createServer((_request, response) => {
    hits += 1;
    response.writeHead(200, { 'Content-Type': 'image/png' }).end(pixel);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/asset.png`;
  const directory = await mkdtemp(join(tmpdir(), 'im83-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'asset.png');
  await writeFile(path, pixel);
  const fileUrl = pathToFileURL(path).href;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  // Positive controls: these exact assets are usable by unrestricted Chromium.
  const control = await browser.newPage();
  await control.goto(url);
  assert.equal(hits, 1);
  await control.goto(fileUrl);
  assert.equal(
    await control
      .locator('img')
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
    1,
  );
  await control.close();
  hits = 0;
  const renderer = createRenderer({ launch: async () => browser });
  const failed = new Set<string>();
  let widths: number[] = [];
  const originalContext = browser.newContext.bind(browser);
  t.mock.method(
    browser,
    'newContext',
    async (...args: Parameters<typeof browser.newContext>) => {
      const context = await originalContext(...args);
      context.on('page', (page) => {
        page.on('requestfailed', (request) => failed.add(request.url()));
        const print = page.pdf.bind(page);
        t.mock.method(
          page,
          'pdf',
          async (...options: Parameters<typeof page.pdf>) => {
            widths = await page
              .locator('img')
              .evaluateAll((images) =>
                images.map((img) => (img as HTMLImageElement).naturalWidth),
              );

            return print(...options);
          },
        );
      });

      return context;
    },
  );
  const pdf = await renderer.render(
    `<img src="${url}"><img src="${fileUrl}"><img src="data:image/png;base64,${pixel.toString('base64')}">`,
  );
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(hits, 0);
  assert.ok(failed.has(url));
  assert.deepEqual(widths, [0, 0, 1]);
});

test('Chromium does not execute submitted scripts before printing', async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const renderer = createRenderer({ launch: async () => browser });
  let printedText = '';
  const originalContext = browser.newContext.bind(browser);
  t.mock.method(
    browser,
    'newContext',
    async (...args: Parameters<typeof browser.newContext>) => {
      const context = await originalContext(...args);
      context.on('page', (page) => {
        const print = page.pdf.bind(page);
        t.mock.method(
          page,
          'pdf',
          async (...options: Parameters<typeof page.pdf>) => {
            printedText = await page.locator('h1').innerText();

            return print(...options);
          },
        );
      });

      return context;
    },
  );
  const pdf = await renderer.render(
    '<h1>Before</h1><script>document.querySelector("h1").textContent = "After"</script>',
  );
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.equal(printedText, 'Before');
});
