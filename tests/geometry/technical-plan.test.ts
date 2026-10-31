import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { analyzeDrawing, identity, prepareDrawingPage, type AnalyzeInput } from '../../src/geometry';
import { dimensionLabelIssue } from '../../src/geometry/dimension-labels';
import { createNodePageRenderer } from '../../src/geometry/node-renderer';
import type { VisionOutput } from '../../src/vision/schema';

const at = '2026-10-31T09:00:00Z';
const bbox = { kind: 'BBOX' as const, x: 10, y: 20, width: 30, height: 40 };

function input(output: VisionOutput): AnalyzeInput {
  const projectId = randomUUID(), drawingId = randomUUID(), floorId = randomUUID();
  return {
    page: { projectId, drawingId, revision: 1, page: 1, sha256: 'a'.repeat(64), sourceWidth: 1280, sourceHeight: 1112, rasterWidth: 1280, rasterHeight: 1112, rasterReference: 'private', sourceToRaster: identity, rasterToSource: identity, rotation: 0, preprocessingVersion: 'test' },
    floor: { id: floorId, projectId, drawingId, page: 1, levelLabel: 'Test', imageWidthPx: 1280, imageHeightPx: 1112 },
    at, cache: { async get() { return undefined; }, async set() {} }, reserveBudget: async () => {},
    readPrivateRaster: async () => new Uint8Array(),
    vision: { model: 'mock:annotation-mapping-only', async run() { return { output, inputTokens: 0, outputTokens: 0 }; } },
  };
}

test('the actual user-provided plan prepares at its original dimensions without synthetic substitution', async () => {
  const bytes = await readFile('fixtures/plans/residential-dimensioned.png');
  const projectId = randomUUID(), drawingId = randomUUID();
  const page = await prepareDrawingPage({
    drawing: { id: drawingId, projectId, revision: 1, originalName: 'residential-dimensioned.png', mimeType: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), storageKey: 'private-original', byteSize: bytes.length, pageCount: 1, selectedPage: 1, uploadedAt: at },
    page: 1, readPrivate: async () => bytes, writePrivateRaster: async () => 'private-raster', renderer: createNodePageRenderer(),
  });
  assert.deepEqual([page.sourceWidth, page.sourceHeight, page.rasterWidth, page.rasterHeight], [1280, 1112, 1280, 1112]);
  assert.deepEqual(page.sourceToRaster, identity);
});

test('nominal pairs, unitless labels and converted values cannot masquerade as explicit clear widths', () => {
  for (const [rawLabel, value, unit] of [['80/200 cm', 80, 'cm'], ['200\n80', 80, 'cm'], ['652', 6.52, 'm'], ['80', 80, 'cm'], ['V2', 2, 'm'], ['80 cm', 0.8, 'm']] as const) {
    assert.ok(dimensionLabelIssue({ metric: 'CLEAR_WIDTH_M', rawLabel, value, unit }), rawLabel);
  }
  assert.ok(dimensionLabelIssue({ metric: 'CLEAR_WIDTH_M', rawLabel: '80 cm', value: 80, unit: 'cm', dimensionKind: 'NOMINAL_OPENING' }));
  assert.ok(dimensionLabelIssue({ metric: 'CLEAR_WIDTH_M', rawLabel: '80 cm', value: 80, unit: 'cm', dimensionKind: 'UNCERTAIN' }));
  for (const [rawLabel, value, unit] of [['Clear span 80 cm', 80, 'cm'], ['0,90 m', 0.9, 'm'], ['Ширина 80 цм', 80, 'cm']] as const) {
    assert.equal(dimensionLabelIssue({ metric: 'CLEAR_WIDTH_M', rawLabel, value, unit }), undefined);
  }
});

test('annotation mapping retains room dimensions and marks as located evidence without invented measurements', async () => {
  // Mocked model output exercises mapping only; this is not evidence of recognition accuracy.
  const i = input({ elements: [
    { ref: 'room', type: 'ROOM', label: '2', geometry: bbox, labels: [{ text: '652', geometry: bbox }, { text: '325', geometry: bbox }], measurements: [] },
    { ref: 'door', type: 'DOOR', label: 'V2', geometry: bbox, labels: [{ text: 'V2', geometry: bbox }], measurements: [{ metric: 'CLEAR_WIDTH_M', rawLabel: '80\n200', value: 80, unit: 'cm', geometry: bbox, dimensionKind: 'NOMINAL_OPENING', confidence: 0.99 }] },
  ], warnings: ['Unit legend is not visible.'] });
  const result = await analyzeDrawing(i);
  assert.deepEqual(result.measurements, []);
  assert.ok(result.evidence.some((evidence) => evidence.text === '80\n200'));
  const room = result.elements.find((element) => element.type === 'ROOM')!;
  const roomLabels = result.evidence.filter((evidence) => room.evidenceIds.includes(evidence.id)).map((evidence) => evidence.text);
  assert.ok(roomLabels.includes('652'));
  assert.ok(roomLabels.includes('325'));
  assert.ok(result.missingInputs.some((request) => /nominal/.test(request.reason)));
  assert.ok(result.elements.every((element) => element.extraction === 'AI_SUGGESTED'));
});

test('unsupported units remain evidence while explicit clear-span labels remain unverified suggestions', async () => {
  for (const rawLabel of ['80', '80 cm']) {
    const result = await analyzeDrawing(input({ elements: [{ ref: 'door', type: 'DOOR', geometry: bbox, measurements: [{ metric: 'CLEAR_WIDTH_M', rawLabel, value: 80, unit: 'cm', confidence: 1 }] }], warnings: [] }));
    assert.equal(result.measurements.length, rawLabel === '80 cm' ? 1 : 0);
    if (result.measurements.length) {
      assert.equal(result.measurements[0].value, 0.8);
      assert.equal(result.measurements[0].verification, 'UNVERIFIED');
    }
    assert.equal(result.missingInputs.length, 1);
    assert.ok(result.evidence.some((evidence) => evidence.text === rawLabel));
  }
});

test('annotation geometry is validated in the same source frame as element geometry', async () => {
  await assert.rejects(analyzeDrawing(input({ elements: [{ ref: 'room', type: 'ROOM', geometry: bbox, labels: [{ text: '652', geometry: { ...bbox, x: 1270 } }], measurements: [] }], warnings: [] })), /VISION_GEOMETRY_BOUNDS/);
});
