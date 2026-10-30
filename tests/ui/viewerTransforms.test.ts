import assert from "node:assert/strict";
import test from "node:test";
import {
  screenToSource,
  sourceToScreen,
  zoomAtScreenPoint,
  calculateFitToBounds,
  calculateFocusOnRect,
  isPointInsideGeometry,
  getGeometryBounds,
  type ViewportTransform,
} from "../../src/ui/components/panels/viewerTransforms";
import type { Geometry, Point } from "../../src/ui/api";

test("coordinate transformation round-trip preserves exact coordinates", () => {
  const transform: ViewportTransform = {
    scale: 1.5,
    translateX: 120,
    translateY: 80,
  };

  const originalSource: Point = { x: 350, y: 220 };
  const screen = sourceToScreen(originalSource, transform);

  assert.equal(screen.x, 350 * 1.5 + 120);
  assert.equal(screen.y, 220 * 1.5 + 80);

  const recoveredSource = screenToSource(screen, transform);
  assert.ok(Math.abs(recoveredSource.x - originalSource.x) < 1e-9);
  assert.ok(Math.abs(recoveredSource.y - originalSource.y) < 1e-9);
});

test("focal zoom preserves the exact source coordinate under cursor", () => {
  const initialTransform: ViewportTransform = {
    scale: 1.0,
    translateX: 50,
    translateY: 30,
  };

  const cursorScreenPoint: Point = { x: 400, y: 300 };

  // Calculate the source point under the cursor before zoom
  const sourceBefore = screenToSource(cursorScreenPoint, initialTransform);

  // Zoom in by 1.5x at the cursor point
  const zoomedTransform = zoomAtScreenPoint(
    initialTransform,
    cursorScreenPoint,
    1.5,
  );

  assert.equal(zoomedTransform.scale, 1.5);

  // The same screen cursor coordinate must map to the exact same source coordinate
  const sourceAfter = screenToSource(cursorScreenPoint, zoomedTransform);

  assert.ok(
    Math.abs(sourceAfter.x - sourceBefore.x) < 1e-9,
    `Source X shifted: ${sourceAfter.x} vs ${sourceBefore.x}`,
  );
  assert.ok(
    Math.abs(sourceAfter.y - sourceBefore.y) < 1e-9,
    `Source Y shifted: ${sourceAfter.y} vs ${sourceBefore.y}`,
  );
});

test("calculateFitToBounds centers drawing with padding within viewport", () => {
  const viewportWidth = 1000;
  const viewportHeight = 800;
  const drawingWidth = 1200;
  const drawingHeight = 900;
  const padding = 40;

  const fit = calculateFitToBounds(
    viewportWidth,
    viewportHeight,
    drawingWidth,
    drawingHeight,
    padding,
  );

  const availableW = viewportWidth - padding * 2;
  const availableH = viewportHeight - padding * 2;
  const expectedScale = Math.min(availableW / drawingWidth, availableH / drawingHeight);

  assert.ok(Math.abs(fit.scale - expectedScale) < 1e-9);

  // Check drawing center aligns with viewport center
  const drawingCenterScreen = sourceToScreen(
    { x: drawingWidth / 2, y: drawingHeight / 2 },
    fit,
  );
  assert.ok(Math.abs(drawingCenterScreen.x - viewportWidth / 2) < 1e-9);
  assert.ok(Math.abs(drawingCenterScreen.y - viewportHeight / 2) < 1e-9);
});

test("calculateFocusOnRect centers on target element bounding box", () => {
  const viewportWidth = 1200;
  const viewportHeight = 800;
  const targetRect = { x: 200, y: 300, width: 400, height: 100 };

  const focused = calculateFocusOnRect(viewportWidth, viewportHeight, targetRect, 1.5);

  const targetCenterSource: Point = {
    x: targetRect.x + targetRect.width / 2,
    y: targetRect.y + targetRect.height / 2,
  };

  const targetCenterScreen = sourceToScreen(targetCenterSource, focused);

  assert.ok(Math.abs(targetCenterScreen.x - viewportWidth / 2) < 1e-9);
  assert.ok(Math.abs(targetCenterScreen.y - viewportHeight / 2) < 1e-9);
});

test("isPointInsideGeometry accurately hit-tests BBOX geometries", () => {
  const bbox: Geometry = {
    kind: "BBOX",
    x: 100,
    y: 150,
    width: 200,
    height: 80,
  };

  // Inside
  assert.equal(isPointInsideGeometry({ x: 150, y: 190 }, bbox), true);
  // Boundary
  assert.equal(isPointInsideGeometry({ x: 100, y: 150 }, bbox), true);
  assert.equal(isPointInsideGeometry({ x: 300, y: 230 }, bbox), true);
  // Outside
  assert.equal(isPointInsideGeometry({ x: 99, y: 190 }, false ? bbox : bbox), false);
  assert.equal(isPointInsideGeometry({ x: 301, y: 190 }, bbox), false);
  assert.equal(isPointInsideGeometry({ x: 150, y: 149 }, bbox), false);
  assert.equal(isPointInsideGeometry({ x: 150, y: 231 }, bbox), false);
});

test("isPointInsideGeometry accurately hit-tests POLYGON geometries using ray casting", () => {
  const polygon: Geometry = {
    kind: "POLYGON",
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ],
  };

  // Center point
  assert.equal(isPointInsideGeometry({ x: 150, y: 150 }, polygon), true);
  // Outside
  assert.equal(isPointInsideGeometry({ x: 50, y: 150 }, polygon), false);
  assert.equal(isPointInsideGeometry({ x: 250, y: 150 }, polygon), false);
});

test("getGeometryBounds extracts exact bounding box for BBOX and POLYGON", () => {
  const bbox: Geometry = { kind: "BBOX", x: 50, y: 60, width: 120, height: 90 };
  assert.deepEqual(getGeometryBounds(bbox), { x: 50, y: 60, width: 120, height: 90 });

  const polygon: Geometry = {
    kind: "POLYGON",
    points: [
      { x: 30, y: 40 },
      { x: 150, y: 70 },
      { x: 80, y: 200 },
    ],
  };
  const polyBounds = getGeometryBounds(polygon);
  assert.equal(polyBounds.x, 30);
  assert.equal(polyBounds.y, 40);
  assert.equal(polyBounds.width, 120); // 150 - 30
  assert.equal(polyBounds.height, 160); // 200 - 40
});
