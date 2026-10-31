import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SCALE, boundsOf, fitRect, pathOf, toScreen, toSource, zoomAt } from "../../src/ui/viewer/transforms";
import { formatValue, requirementPrefix } from "../../src/ui/format";

test("screen and source coordinates round-trip", () => {
  const view = { scale: 1.7, x: -40, y: 25 };
  const source = { x: 312.5, y: 88 };
  const back = toSource(toScreen(source, view), view);
  assert.ok(Math.abs(back.x - source.x) < 1e-9 && Math.abs(back.y - source.y) < 1e-9);
});

test("zooming keeps the source point under the cursor fixed and respects limits", () => {
  const view = { scale: 1, x: 10, y: 20 };
  const anchor = { x: 400, y: 300 };
  const before = toSource(anchor, view);
  const zoomed = zoomAt(view, anchor, 2);
  const after = toSource(anchor, zoomed);
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
  assert.equal(zoomAt({ scale: MAX_SCALE, x: 0, y: 0 }, anchor, 2).scale, MAX_SCALE);
});

test("fitting centres the target inside the padded viewport", () => {
  const view = fitRect(1000, 800, { x: 0, y: 0, width: 800, height: 600 }, 50);
  assert.equal(view.scale, Math.min(900 / 800, 700 / 600));
  const centre = toScreen({ x: 400, y: 300 }, view);
  assert.ok(Math.abs(centre.x - 500) < 1e-9 && Math.abs(centre.y - 400) < 1e-9);
});

test("geometry bounds and SVG paths use source pixels", () => {
  assert.deepEqual(boundsOf({ kind: "POLYLINE", points: [{ x: 5, y: 9 }, { x: 25, y: 1 }] }), { x: 5, y: 1, width: 20, height: 8 });
  assert.equal(pathOf({ kind: "BBOX", x: 1, y: 2, width: 3, height: 4 }), "M1 2H4V6H1Z");
  assert.equal(pathOf({ kind: "POLYGON", points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }] }), "M0 0L2 0L1 1Z");
});

test("requirements read as at-least or at-most from the engine reason, never from the numbers", () => {
  assert.equal(requirementPrefix({ reasonCode: "BELOW_MINIMUM" }), "at least ");
  assert.equal(requirementPrefix({ reasonCode: "MAX_SATISFIED" }), "at most ");
  assert.equal(requirementPrefix({ reasonCode: "BOOL_MATCH" }), "");
  assert.equal(formatValue(1.05, "m"), "1.05 m");
  assert.equal(formatValue(0.05, "ratio"), "5 %");
  assert.equal(formatValue(undefined, "m"), "not established");
});
