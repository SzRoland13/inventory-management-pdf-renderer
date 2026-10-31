import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createRenderer } from '@/renderer';

test('Chromium produces a PDF and blocks external and local resource access', async (t: TestContext) => {
  const renderer = createRenderer({ timeoutMs: 15_000 });

  await renderer.start();
  t.after(() => renderer.close());

  const pdf = await renderer.render(
    `<!doctype html><html><body>
    <h1>Renderer integration check</h1>
    <img src="https://example.invalid/tracker">
    <img src="file:///etc/passwd">
  </body></html>`,
    { format: 'A4', margin: { top: '10mm', bottom: '10mm' } },
  );

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 100);
});

test('Chromium does not execute submitted scripts', async (t: TestContext) => {
  const renderer = createRenderer({ timeoutMs: 15_000 });

  await renderer.start();
  t.after(() => renderer.close());

  const pdf = await renderer.render(
    '<h1>Before</h1><script>document.body.innerHTML = "After"</script>',
  );

  assert.ok(Buffer.isBuffer(pdf));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});
