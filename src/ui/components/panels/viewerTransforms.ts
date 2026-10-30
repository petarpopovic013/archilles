import type { Geometry, Point } from "../../api";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 5.0;

/**
 * Convert screen/container pixel coordinate to source drawing pixel coordinate.
 * Source page coordinate system: top-left origin, x right, y down.
 */
export function screenToSource(
  screenPoint: Point,
  transform: ViewportTransform,
): Point {
  if (transform.scale === 0) return { x: 0, y: 0 };
  return {
    x: (screenPoint.x - transform.translateX) / transform.scale,
    y: (screenPoint.y - transform.translateY) / transform.scale,
  };
}

/**
 * Convert source drawing pixel coordinate to screen/container pixel coordinate.
 */
export function sourceToScreen(
  sourcePoint: Point,
  transform: ViewportTransform,
): Point {
  return {
    x: sourcePoint.x * transform.scale + transform.translateX,
    y: sourcePoint.y * transform.scale + transform.translateY,
  };
}

/**
 * Zoom in or out around a screen focal point (such as mouse cursor position),
 * preserving the exact source coordinate under the cursor.
 */
export function zoomAtScreenPoint(
  currentTransform: ViewportTransform,
  screenFocalPoint: Point,
  scaleMultiplier: number,
  minScale = MIN_SCALE,
  maxScale = MAX_SCALE,
): ViewportTransform {
  const newScale = Math.min(
    maxScale,
    Math.max(minScale, currentTransform.scale * scaleMultiplier),
  );

  if (newScale === currentTransform.scale) {
    return currentTransform;
  }

  const sourceX =
    (screenFocalPoint.x - currentTransform.translateX) / currentTransform.scale;
  const sourceY =
    (screenFocalPoint.y - currentTransform.translateY) / currentTransform.scale;

  return {
    scale: newScale,
    translateX: screenFocalPoint.x - sourceX * newScale,
    translateY: screenFocalPoint.y - sourceY * newScale,
  };
}

/**
 * Calculate transform that centers and fits the drawing within viewport bounds.
 */
export function calculateFitToBounds(
  viewportWidth: number,
  viewportHeight: number,
  drawingWidth: number,
  drawingHeight: number,
  padding = 40,
): ViewportTransform {
  if (
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    drawingWidth <= 0 ||
    drawingHeight <= 0
  ) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }

  const availW = Math.max(20, viewportWidth - padding * 2);
  const availH = Math.max(20, viewportHeight - padding * 2);

  const scale = Math.min(availW / drawingWidth, availH / drawingHeight);
  const translateX = (viewportWidth - drawingWidth * scale) / 2;
  const translateY = (viewportHeight - drawingHeight * scale) / 2;

  return {
    scale,
    translateX,
    translateY,
  };
}

/**
 * Calculate transform that smoothly centers on a target bounding box.
 */
export function calculateFocusOnRect(
  viewportWidth: number,
  viewportHeight: number,
  targetRect: Rect,
  desiredScale?: number,
): ViewportTransform {
  const centerX = targetRect.x + targetRect.width / 2;
  const centerY = targetRect.y + targetRect.height / 2;

  const scale =
    desiredScale ??
    Math.min(
      2.0,
      Math.max(
        0.8,
        Math.min(
          (viewportWidth * 0.55) / Math.max(10, targetRect.width),
          (viewportHeight * 0.55) / Math.max(10, targetRect.height),
        ),
      ),
    );

  return {
    scale,
    translateX: viewportWidth / 2 - centerX * scale,
    translateY: viewportHeight / 2 - centerY * scale,
  };
}

/**
 * Hit-test whether a source-space point lies within an element's geometry.
 */
export function isPointInsideGeometry(point: Point, geometry: Geometry): boolean {
  if (geometry.kind === "BBOX") {
    return (
      point.x >= geometry.x &&
      point.x <= geometry.x + geometry.width &&
      point.y >= geometry.y &&
      point.y <= geometry.y + geometry.height
    );
  }

  if (geometry.kind === "POLYGON") {
    let inside = false;
    const pts = geometry.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const yi = pts[i].y;
      const xj = pts[j].x;
      const yj = pts[j].y;

      const intersect =
        yi > point.y !== yj > point.y &&
        point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  if (geometry.kind === "POLYLINE") {
    const tolerance = 10;
    const pts = geometry.points;
    for (let i = 0; i < pts.length - 1; i++) {
      if (distToSegment(point, pts[i], pts[i + 1]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function distToSegment(p: Point, v: Point, w: Point): number {
  const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
  if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

/**
 * Compute the bounding rectangle of any geometry.
 */
export function getGeometryBounds(geometry: Geometry): Rect {
  if (geometry.kind === "BBOX") {
    return {
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
    };
  }

  const xs = geometry.points.map((p) => p.x);
  const ys = geometry.points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
