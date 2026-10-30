import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import sharp from 'sharp';
import { prepareDrawingPage, transformPoint } from '../../src/geometry';
import { createNodePageRenderer } from '../../src/geometry/node-renderer';

const renderer = createNodePageRenderer();

test('native renderer decodes both real PNG and JPG fixture pairs', async () => {
  for (const name of ['office-a', 'office-b']) for (const [ext, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg']] as const) {
    const bytes = await readFile(`fixtures/plans/${name}.${ext}`);
    const meta = await renderer.inspect(bytes, mime, 1);
    const raster = await renderer.render(bytes, mime, 1, meta.width, meta.height);
    const decoded = await sharp(raster).metadata();
    assert.equal(decoded.format, 'png'); assert.equal(decoded.width, 800); assert.equal(decoded.height, 600);
    assert.equal(decoded.orientation, undefined, 'orientation was applied to the pixels');
  }
});

test('native normalization applies all eight EXIF orientations to actual JPEG pixels', async () => {
  const rgb = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#ffffff' } })
    .composite([{ input: Buffer.from('<svg width="80" height="40"><rect width="20" height="10" fill="black"/></svg>') }]).jpeg().toBuffer();
  for (let orientation = 1; orientation <= 8; orientation++) {
    const bytes = await sharp(rgb).withMetadata({ orientation }).jpeg().toBuffer();
    const meta = await renderer.inspect(bytes, 'image/jpeg', 1);
    assert.equal(meta.width, orientation >= 5 ? 40 : 80); assert.equal(meta.height, orientation >= 5 ? 80 : 40);
    const actual = await renderer.render(bytes, 'image/jpeg', 1, meta.width, meta.height);
    const expected = await sharp(bytes).autoOrient().flatten({ background: '#ffffff' }).png().toBuffer();
    assert.deepEqual(await sharp(actual).raw().toBuffer(), await sharp(expected).raw().toBuffer());
  }
});

test('private preparation resizes large PNGs and keeps source-coordinate transforms invertible', async () => {
  const bytes = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#ffffff' } }).png().toBuffer();
  let stored: Uint8Array | undefined;
  const prepared = await prepareDrawingPage({
    drawing: { id: randomUUID(), projectId: randomUUID(), revision: 2, originalName: 'large.png', mimeType: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), storageKey: 'uploads/private', byteSize: bytes.length, pageCount: 1, selectedPage: 1, uploadedAt: '2026-10-30T12:00:00Z' },
    page: 1, renderer, readPrivate: async () => bytes, writePrivateRaster: async raster => { stored = raster; return 'rasters/private'; },
  });
  const meta = await sharp(stored!).metadata();
  assert.equal(meta.width, 2048); assert.equal(meta.height, 1536); assert.equal(prepared.sourceWidth, 4000);
  const point = { x: 1700, y: 1200 };
  const roundTrip = transformPoint(prepared.rasterToSource, transformPoint(prepared.sourceToRaster, point));
  assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9 && Math.abs(roundTrip.y - point.y) < 1e-9);
});

/** Small synthetic vector PDF with a known marker; no legal content or confidential drawings. */
function markerPdf(rotate = 0, count = 1) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${count} >>`];
  for (let i = 0; i < count; i++) {
    const stream = '0 0 0 rg 20 60 20 20 re f';
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 100] /CropBox [10 10 110 90] /Rotate ${rotate} /Resources << >> /Contents ${4 + i * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf));
}

test('actual PDF raster pixels align with crop and rotation in the source frame', async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const bytes = markerPdf(rotation), meta = await renderer.inspect(bytes, 'application/pdf', 1);
    assert.equal(meta.width, rotation % 180 ? 160 : 200); assert.equal(meta.height, rotation % 180 ? 200 : 160);
    const raster = await renderer.render(bytes, 'application/pdf', 1, meta.width, meta.height);
    const { data, info } = await sharp(raster).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const blackAt = (x: number, y: number) => data[(y * info.width + x) * info.channels] < 30;
    // Marker centre: (20,20) points relative to the unrotated top-left crop.
    const centres = { 0: [40, 40], 90: [120, 40], 180: [160, 120], 270: [40, 160] };
    const [x, y] = centres[rotation as keyof typeof centres];
    assert.ok(blackAt(x, y), `marker aligned after ${rotation} degree rotation`);
    assert.equal(blackAt(5, 5), false);
  }
});

test('native renderer prepares the selected real PDF page and rejects corrupt/oversized input', async () => {
  const bytes = await readFile('fixtures/plans/offices.pdf');
  const meta = await renderer.inspect(bytes, 'application/pdf', 2);
  assert.equal(meta.pageCount, 2);
  const raster = await renderer.render(bytes, 'application/pdf', 2, meta.width, meta.height);
  assert.equal((await sharp(raster).metadata()).width, 1600);
  await assert.rejects(renderer.inspect(bytes, 'application/pdf', 3), /INVALID_PAGE/);
  await assert.rejects(renderer.inspect(markerPdf(0, 21), 'application/pdf', 1), /PAGE_LIMIT/);
  await assert.rejects(renderer.inspect(Buffer.from('%PDF-1.4\ngarbage'), 'application/pdf', 1), /PDF_CORRUPT/);
  await assert.rejects(renderer.inspect(new Uint8Array([255, 216, 255, 0]), 'image/jpeg', 1), /CORRUPT_IMAGE/);
  await assert.rejects(renderer.render(bytes, 'application/pdf', 1, 99999, 99999), /PIXEL_LIMIT/);
});
