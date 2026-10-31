import assert from 'node:assert/strict';
import test from 'node:test';
import type { Geometry } from '../../src/domain/project';
import { refineGeometry, wallMask, type GrayRaster } from '../../src/geometry/refine';
import type { VisionOutput } from '../../src/vision/schema';

/**
 * 400×300 plan: 12px outer walls, a partition at x 194–206 with a door gap at y 120–170, and a
 * 2px furniture line inside the left room.
 */
function plan(): GrayRaster {
  const width = 400, height = 300, data = new Uint8Array(width * height).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number, value = 0) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = value;
  };
  fill(0, 0, 400, 12); fill(0, 288, 400, 300); fill(0, 0, 12, 300); fill(388, 0, 400, 300);
  fill(194, 12, 206, 120); fill(206 - 12, 170, 206, 288, 110);
  fill(40, 150, 150, 152);
  return { data, width, height };
}

const box = (x: number, y: number, width: number, height: number): Geometry => ({ kind: 'BBOX', x, y, width, height });
const element = (ref: string, type: VisionOutput['elements'][number]['type'], geometry: Geometry, labels: string[] = []) =>
  ({ ref, type, geometry, labels: labels.map(text => ({ text, geometry: box(1, 1, 5, 5) })), measurements: [] });

test('wall mask keeps thick dark and grey fills and drops thin strokes', () => {
  const raster = plan(), mask = wallMask(raster);
  assert.equal(mask[150 * 400 + 6], 1, 'outer wall');
  assert.equal(mask[200 * 400 + 200], 1, 'grey partition fill');
  assert.equal(mask[151 * 400 + 90], 0, 'furniture line');
  assert.equal(mask[145 * 400 + 200], 0, 'door gap');
});

test('room sides move onto the inner faces of nearby walls, not furniture lines', () => {
  const output = refineGeometry({ elements: [element('a', 'ROOM', box(30, 25, 150, 240))], warnings: [] }, plan());
  assert.deepEqual(output.elements[0].geometry, box(12, 12, 182, 276));
  const nearFurniture = refineGeometry({ elements: [element('b', 'ROOM', box(30, 25, 150, 131))], warnings: [] }, plan());
  assert.equal((nearFurniture.elements[0].geometry as { height: number }).height, 156 - 12, 'top snaps; bottom ignores the furniture line');
});

test('a side with no wall nearby keeps the model position', () => {
  const output = refineGeometry({ elements: [element('a', 'ROOM', box(220, 30, 150, 150))], warnings: [] }, plan());
  const g = output.elements[0].geometry as Extract<Geometry, { kind: 'BBOX' }>;
  assert.equal(g.x, 206, 'left side snaps to the partition');
  assert.equal(g.x + g.width, 388, 'right side snaps to the outer wall');
  assert.equal(g.y, 12, 'top side snaps to the outer wall');
  assert.equal(g.y + g.height, 180, 'bottom side has no wall within reach');
});

test('axis-aligned polygons snap side by side', () => {
  const polygon: Geometry = { kind: 'POLYGON', points: [{ x: 25, y: 20 }, { x: 185, y: 20 }, { x: 185, y: 275 }, { x: 25, y: 275 }] };
  const output = refineGeometry({ elements: [element('a', 'ROOM', polygon)], warnings: [] }, plan());
  assert.deepEqual(output.elements[0].geometry, { kind: 'POLYGON', points: [{ x: 12, y: 12 }, { x: 194, y: 12 }, { x: 194, y: 288 }, { x: 12, y: 288 }] });
});

test('a door boxed on its tag moves onto the wall gap', () => {
  const output = refineGeometry({ elements: [element('d', 'DOOR', box(212, 130, 60, 18), ['80/200'])], warnings: [] }, plan());
  assert.deepEqual(output.elements[0].geometry, box(194, 120, 12, 50));
  assert.equal(output.warnings.length, 0);
});

test('an opening with no wall gap nearby keeps its position and is reported', () => {
  const output = refineGeometry({ elements: [element('w', 'OPENING', box(80, 200, 20, 20))], warnings: [] }, plan());
  assert.deepEqual(output.elements[0].geometry, box(80, 200, 20, 20));
  assert.match(output.warnings[0], /No wall gap found near 1 opening\(s\) \(w\)/);
});

test('a door and an entrance on the same gap merge into the entrance', () => {
  const output = refineGeometry({
    elements: [element('d', 'DOOR', box(196, 125, 8, 40), ['V1', '90/205']), element('e', 'ENTRANCE', box(190, 118, 20, 50))],
    warnings: [],
  }, plan());
  assert.deepEqual(output.elements.map(e => e.type), ['ENTRANCE']);
  assert.deepEqual(output.elements[0].labels?.map(label => label.text), ['V1', '90/205']);
});

test('open floor between two perpendicular walls is not mistaken for a door gap', () => {
  // Two 7px vertical walls with two horizontal walls between them leave an 18-row strip of floor
  // that is bounded left and right but has no wall of its own.
  const width = 400, height = 300, data = new Uint8Array(width * height).fill(255);
  const fill = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[y * width + x] = 0;
  };
  fill(150, 0, 157, 300); fill(210, 0, 217, 300); fill(157, 100, 210, 107); fill(157, 125, 210, 132);
  const output = refineGeometry({ elements: [element('d', 'DOOR', box(165, 110, 30, 10))], warnings: [] }, { data, width, height });
  assert.deepEqual(output.elements[0].geometry, box(165, 110, 30, 10));
  assert.match(output.warnings[0], /No wall gap found/);
});
