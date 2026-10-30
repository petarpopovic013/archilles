import type { Geometry, Point } from "../../domain";

/** Screen = source * scale + translate. Source pixels: top-left origin, x right, y down. */
export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const toScreen = (point: Point, view: Viewport): Point =>
  ({ x: point.x * view.scale + view.x, y: point.y * view.scale + view.y });

export const toSource = (point: Point, view: Viewport): Point =>
  ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });

/** Zooms by `factor` keeping the source point under `anchor` (screen pixels) fixed. */
export function zoomAt(view: Viewport, anchor: Point, factor: number): Viewport {
  const scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === view.scale) return view;
  const source = toSource(anchor, view);
  return { scale, x: anchor.x - source.x * scale, y: anchor.y - source.y * scale };
}

export const panBy = (view: Viewport, dx: number, dy: number): Viewport =>
  ({ ...view, x: view.x + dx, y: view.y + dy });

/** Centres `target` (source pixels) in the viewport at the largest scale that fits with padding. */
export function fitRect(viewportWidth: number, viewportHeight: number, target: Rect, padding = 32, maxScale = MAX_SCALE): Viewport {
  if (viewportWidth <= 0 || viewportHeight <= 0 || target.width <= 0 || target.height <= 0) return { scale: 1, x: 0, y: 0 };
  const scale = clamp(
    Math.min((viewportWidth - padding * 2) / target.width, (viewportHeight - padding * 2) / target.height),
    MIN_SCALE,
    maxScale,
  );
  return {
    scale,
    x: viewportWidth / 2 - (target.x + target.width / 2) * scale,
    y: viewportHeight / 2 - (target.y + target.height / 2) * scale,
  };
}

export function boundsOf(geometry: Geometry): Rect {
  if (geometry.kind === "BBOX") return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** SVG path data for a geometry, in source pixels. */
export function pathOf(geometry: Geometry): string {
  if (geometry.kind === "BBOX") {
    const { x, y, width, height } = geometry;
    return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
  }
  const [first, ...rest] = geometry.points;
  return `M${first.x} ${first.y}${rest.map((point) => `L${point.x} ${point.y}`).join("")}${geometry.kind === "POLYGON" ? "Z" : ""}`;
}
