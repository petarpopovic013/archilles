import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { createBrowserPageRenderer } from '../../src/geometry/browser-renderer';
import { inspectImageHeader } from '../../src/geometry/image-metadata';

function withOrientation(jpeg: Uint8Array, orientation: number) {
  // APP1 with little-endian TIFF IFD0 and a single SHORT Orientation entry.
  const segment = Buffer.alloc(36);
  segment.writeUInt16BE(0xffe1, 0); segment.writeUInt16BE(34, 2);
  segment.write('Exif\0\0', 4, 'binary'); segment.write('II', 10);
  segment.writeUInt16LE(42, 12); segment.writeUInt32LE(8, 14); segment.writeUInt16LE(1, 18);
  segment.writeUInt16LE(0x0112, 20); segment.writeUInt16LE(3, 22);
  segment.writeUInt32LE(1, 24); segment.writeUInt16LE(orientation, 28);
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]);
}

test('both PNG/JPG fixtures have matching source dimensions without decoding', async () => {
  const renderer = createBrowserPageRenderer();
  for (const name of ['office-a', 'office-b']) {
    for (const [extension, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg']] as const) {
      assert.deepEqual(await renderer.inspect(await readFile(`fixtures/plans/${name}.${extension}`), mime, 1),
        { pageCount: 1, width: 800, height: 600, rotation: 0 });
    }
  }
});

test('EXIF rotations and mirrored orientations use the oriented source frame', async () => {
  const jpeg = await readFile('fixtures/plans/office-a.jpg');
  for (let orientation = 1; orientation <= 8; orientation++) {
    const meta = inspectImageHeader(withOrientation(jpeg, orientation), 'image/jpeg');
    assert.equal(meta.orientation, orientation);
    assert.equal(meta.width, orientation >= 5 ? 600 : 800);
    assert.equal(meta.height, orientation >= 5 ? 800 : 600);
  }
  assert.throws(() => inspectImageHeader(withOrientation(jpeg, 9), 'image/jpeg'), /CORRUPT_IMAGE/);
});

test('truncated JPEG frames and corrupt EXIF fail with stable errors', async () => {
  const jpeg = await readFile('fixtures/plans/office-a.jpg');
  for (const bytes of [new Uint8Array(), Uint8Array.from([255, 216, 255, 192, 0, 2]), withOrientation(jpeg, 6).subarray(0, 25)]) {
    assert.throws(() => inspectImageHeader(bytes, 'image/jpeg'), /CORRUPT_IMAGE/);
  }
  const broken = withOrientation(jpeg, 6); broken.writeUInt32LE(0xffffff00, 14);
  assert.throws(() => inspectImageHeader(broken, 'image/jpeg'), /CORRUPT_IMAGE/);
});

test('huge image metadata is rejected before any bitmap allocation', async () => {
  const png = await readFile('fixtures/plans/office-a.png');
  png.writeUInt32BE(100000, 16); png.writeUInt32BE(100000, 20);
  await assert.rejects(createBrowserPageRenderer().inspect(png, 'image/png', 1), /PIXEL_LIMIT/);
  await assert.rejects(createBrowserPageRenderer().render(png, 'image/png', 1, 100000, 100000), /PIXEL_LIMIT/);
});

test('image pages must be one-based and contain only one page', async () => {
  const bytes = await readFile('fixtures/plans/office-a.jpg');
  for (const page of [0, 2, 1.5, NaN]) await assert.rejects(createBrowserPageRenderer().inspect(bytes, 'image/jpeg', page), /INVALID_PAGE/);
});

function pdfHarness(overrides: Partial<PDFDocumentProxy> = {}) {
  let destroyed = 0;
  const requested: number[] = [];
  const document = {
    numPages: 2,
    async getPage(page: number) {
      requested.push(page);
      return { rotate: 90, view: [10, 20, 810, 620], getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }) };
    },
    ...overrides,
  } as unknown as PDFDocumentProxy;
  const task = { promise: Promise.resolve(document), async destroy() { destroyed++; } } as unknown as PDFDocumentLoadingTask;
  return { renderer: createBrowserPageRenderer({ loadPdf: async () => task }), requested, destroyed: () => destroyed };
}

test('selected PDF page preserves intrinsic rotation and crop; task is released', async () => {
  const harness = pdfHarness();
  const meta = await harness.renderer.inspect(new Uint8Array(), 'application/pdf', 2);
  assert.deepEqual(meta, { pageCount: 2, width: 1200, height: 1600, rotation: 90, cropBox: [10, 20, 810, 620] });
  assert.deepEqual(harness.requested, [2]); assert.equal(harness.destroyed(), 1);
});

test('PDF page limits and page errors release the loading task', async () => {
  for (const [count, page, code] of [[21, 1, 'PAGE_LIMIT'], [2, 3, 'INVALID_PAGE'], [2, 0, 'INVALID_PAGE']] as const) {
    const harness = pdfHarness({ numPages: count });
    await assert.rejects(harness.renderer.inspect(new Uint8Array(), 'application/pdf', page), new RegExp(code));
    assert.equal(harness.destroyed(), 1); assert.deepEqual(harness.requested, []);
  }
});

test('password-protected PDFs fail promptly and release pending task', async () => {
  let destroyed = 0;
  const task = {
    onPassword: undefined as PDFDocumentLoadingTask['onPassword'] | undefined,
    get promise() {
      queueMicrotask(() => task.onPassword?.(() => {}, 1));
      return new Promise<PDFDocumentProxy>(() => {});
    },
    async destroy() { destroyed++; },
  };
  const renderer = createBrowserPageRenderer({ loadPdf: async () => task as unknown as PDFDocumentLoadingTask });
  await assert.rejects(renderer.inspect(new Uint8Array(), 'application/pdf', 1), /PDF_ENCRYPTED/);
  assert.equal(destroyed, 1);
});

test('corrupt PDFs are sanitized and their loading task is released', async () => {
  let destroyed = 0;
  const task = { get promise() { return Promise.reject(new Error('private PDF details')); }, async destroy() { destroyed++; } };
  const renderer = createBrowserPageRenderer({ loadPdf: async () => task as unknown as PDFDocumentLoadingTask });
  await assert.rejects(renderer.inspect(new Uint8Array(), 'application/pdf', 1), /PDF_CORRUPT/);
  assert.equal(destroyed, 1);
});


test('committed two-page PDF parses with PDF.js and preserves the source frame', async () => {
  // Node-compatible build is used only for this parser check; production rendering stays browser-only.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const renderer = createBrowserPageRenderer({ loadPdf: async bytes => getDocument({ data: bytes }) });
  const bytes = await readFile('fixtures/plans/offices.pdf');
  const original = Buffer.from(bytes);
  const first = await renderer.inspect(bytes, 'application/pdf', 1);
  const second = await renderer.inspect(bytes, 'application/pdf', 2);
  assert.equal(first.pageCount, 2);
  assert.equal(first.width, 1600); assert.equal(first.height, 1200);
  assert.deepEqual(second, first);
  assert.deepEqual(bytes, original);
  await assert.rejects(renderer.inspect(bytes, 'application/pdf', 3), /INVALID_PAGE/);
});
