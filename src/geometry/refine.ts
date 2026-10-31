import type { Geometry, Point } from '../domain/project';
import type { VisionOutput } from '../vision/schema';

/** Single-channel raster in the same pixel frame as the Vision output. */
export interface GrayRaster { data: Uint8Array; width: number; height: number }
type Box = [x0: number, y0: number, x1: number, y1: number];
type Side = 'top' | 'bottom' | 'left' | 'right';

/** Walls are drawn as dark or grey fills; text, furniture and dimension lines are lighter or thinner. */
const WALL_LUMINANCE = 150;
/** A wall face must cover this share of a room side, leaving room for doors and windows. */
const SIDE_COVERAGE = 0.25;
const OPENING_TYPES = new Set(['DOOR', 'ENTRANCE', 'EXIT', 'OPENING']);
const SPACE_TYPES = new Set(['ROOM', 'CORRIDOR']);

/**
 * Wall pixels: dark pixels that survive a morphological opening, which removes strokes thinner
 * than `k` pixels (text, furniture, dimension and hatch lines).
 */
export function wallMask({ data, width: w, height: h }: GrayRaster, k = Math.max(3, Math.round(Math.max(w, h) / 300))): Uint8Array {
  const stride = w + 1;
  const dark = new Int32Array(stride * (h + 1)), core = new Int32Array(stride * (h + 1));
  const sum = (a: Int32Array, x0: number, y0: number, x1: number, y1: number) => a[y1 * stride + x1] - a[y0 * stride + x1] - a[y1 * stride + x0] + a[y0 * stride + x0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    dark[(y + 1) * stride + x + 1] = (data[y * w + x] < WALL_LUMINANCE ? 1 : 0) + dark[y * stride + x + 1] + dark[(y + 1) * stride + x] - dark[y * stride + x];
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const full = x + k <= w && y + k <= h && sum(dark, x, y, x + k, y + k) === k * k ? 1 : 0;
    core[(y + 1) * stride + x + 1] = full + core[y * stride + x + 1] + core[(y + 1) * stride + x] - core[y * stride + x];
  }
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    mask[y * w + x] = sum(core, Math.max(0, x - k + 1), Math.max(0, y - k + 1), x + 1, y + 1) > 0 ? 1 : 0;
  }
  dropSpecks(mask, w, h, (Math.max(w, h) * 0.008) ** 2);
  return mask;
}

/** Clears connected wall blobs smaller than `minArea`: leftovers of bold text and symbols. */
function dropSpecks(mask: Uint8Array, w: number, h: number, minArea: number) {
  const seen = new Uint8Array(w * h), stack: number[] = [], blob: number[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    stack.push(start); seen[start] = 1; blob.length = 0;
    while (stack.length) {
      const i = stack.pop()!, x = i % w;
      blob.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < mask.length && mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
      }
    }
    if (blob.length < minArea) for (const i of blob) mask[i] = 0;
  }
}

class Walls {
  readonly maxDim: number;
  constructor(readonly mask: Uint8Array, readonly w: number, readonly h: number) { this.maxDim = Math.max(w, h); }
  at(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.mask[y * this.w + x] : 0; }
  /** Share of wall pixels along row `y` (or column, when `vertical`) between `from` and `to`. */
  coverage(vertical: boolean, at: number, from: number, to: number): number {
    let n = 0, total = 0;
    for (let i = Math.max(0, from); i < Math.min(vertical ? this.h : this.w, to); i++, total++) n += vertical ? this.at(at, i) : this.at(i, at);
    return total ? n / total : 0;
  }
}

/** Runs of indexes where `test` holds. */
function runs(from: number, to: number, test: (i: number) => boolean): Array<{ start: number; end: number }> {
  const found: Array<{ start: number; end: number }> = [];
  let start = -1;
  for (let i = from; i <= to; i++) {
    const on = i < to && test(i);
    if (on && start < 0) start = i;
    if (!on && start >= 0) { found.push({ start, end: i - 1 }); start = -1; }
  }
  return found;
}

/** Moves one room side to the inner face of the nearest wall band within tolerance. */
function snapSide(walls: Walls, side: Side, pos: number, spanFrom: number, spanTo: number): number {
  const vertical = side === 'left' || side === 'right';
  const inset = (spanTo - spanFrom) * 0.15, lo = Math.round(spanFrom + inset), hi = Math.round(spanTo - inset);
  if (hi - lo < 4) return pos;
  const tolerance = walls.maxDim * 0.07, limit = vertical ? walls.w : walls.h;
  const from = Math.max(0, Math.round(pos - tolerance)), to = Math.min(limit, Math.round(pos + tolerance) + 1);
  const bands = runs(from, to, i => walls.coverage(vertical, i, lo, hi) >= SIDE_COVERAGE);
  const distance = (b: { start: number; end: number }) => pos < b.start ? b.start - pos : pos > b.end + 1 ? pos - b.end - 1 : 0;
  const band = bands.sort((a, b) => distance(a) - distance(b))[0];
  if (!band) return pos;
  return side === 'top' || side === 'left' ? band.end + 1 : band.start;
}

function bounds(g: Geometry): Box {
  if (g.kind === 'BBOX') return [g.x, g.y, g.x + g.width, g.y + g.height];
  const xs = g.points.map(p => p.x), ys = g.points.map(p => p.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function inside(points: Point[], p: Point): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Snaps each side of a rectangle or axis-aligned polygon to its wall face; other shapes are kept. */
function snapSpace(walls: Walls, g: Geometry): Geometry {
  if (g.kind === 'POLYLINE') return g;
  const points = g.kind === 'BBOX'
    ? [{ x: g.x, y: g.y }, { x: g.x + g.width, y: g.y }, { x: g.x + g.width, y: g.y + g.height }, { x: g.x, y: g.y + g.height }]
    : g.points;
  const n = points.length, square = walls.maxDim * 0.01;
  const edges = points.map((a, i) => {
    const b = points[(i + 1) % n];
    const horizontal = Math.abs(a.y - b.y) <= square, vertical = Math.abs(a.x - b.x) <= square;
    if (horizontal === vertical) return undefined;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, probe = 3;
    const side: Side = horizontal
      ? (inside(points, { x: mid.x, y: mid.y + probe }) ? 'top' : 'bottom')
      : (inside(points, { x: mid.x + probe, y: mid.y }) ? 'left' : 'right');
    const pos = horizontal ? mid.y : mid.x;
    const [from, to] = horizontal ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    return { horizontal, pos: snapSide(walls, side, pos, from, to) };
  });
  if (edges.some(edge => !edge)) return g;
  const snapped = points.map((p, i) => {
    const before = edges[(i - 1 + n) % n]!, after = edges[i]!;
    if (before.horizontal === after.horizontal) return before.horizontal ? { x: p.x, y: after.pos } : { x: after.pos, y: p.y };
    return before.horizontal ? { x: after.pos, y: before.pos } : { x: before.pos, y: after.pos };
  });
  const [x0, y0, x1, y1] = bounds({ kind: 'POLYGON', points: snapped });
  const [ox0, oy0, ox1, oy1] = bounds(g);
  // A snap that collapses or inverts the space is a misread wall; keep the model's shape.
  if (x1 - x0 < (ox1 - ox0) * 0.4 || y1 - y0 < (oy1 - oy0) * 0.4) return g;
  if (g.kind === 'BBOX') return { kind: 'BBOX', x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  return { kind: 'POLYGON', points: snapped };
}

/**
 * Moves an opening onto the nearest gap in a wall. Each line across the wall must show wall on
 * both sides of the same gap; a run of such lines is the wall thickness and must be wall-like.
 */
function snapOpening(walls: Walls, g: Geometry): Geometry | undefined {
  const [x0, y0, x1, y1] = bounds(g);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, long = Math.max(x1 - x0, y1 - y0);
  const reach = Math.max(long, walls.maxDim * 0.06);
  const minGap = Math.max(6, walls.maxDim * 0.015), maxGap = walls.maxDim * 0.2;
  const minThickness = Math.max(2, walls.maxDim * 0.004), maxThickness = walls.maxDim * 0.06;
  const tall = y1 - y0 > (x1 - x0) * 1.5, wide = x1 - x0 > (y1 - y0) * 1.5;
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  let best: { box: Box; score: number } | undefined;
  for (const vertical of [true, false]) {
    // `across` runs perpendicular to the wall, `along` runs with it.
    const [ac, al] = vertical ? [cx, cy] : [cy, cx];
    const alongFrom = Math.round(al - reach * 3), alongTo = Math.round(al + reach * 3);
    const gapsAt = (i: number) => {
      const solid = runs(alongFrom, alongTo + 1, j => (vertical ? walls.at(i, j) : walls.at(j, i)) === 1);
      const gaps: Array<{ start: number; end: number; flank: number }> = [];
      for (let k = 0; k + 1 < solid.length; k++) {
        const start = solid[k].end + 1, end = solid[k + 1].start - 1, length = end - start + 1;
        const flank = Math.min(solid[k].end - solid[k].start, solid[k + 1].end - solid[k + 1].start) + 1;
        if (length >= minGap && length <= maxGap) gaps.push({ start, end, flank });
      }
      return gaps;
    };
    // Each gap is tracked across neighbouring lines; wall ends are rarely pixel-aligned, so a
    // neighbouring line may see the same gap a little shifted.
    type Track = { from: number; gap: { start: number; end: number }; starts: number[]; ends: number[]; flanks: number[] };
    const close = (track: Track, to: number) => {
      const thickness = to - track.from + 1;
      if (thickness < minThickness || thickness > maxThickness) return;
      // A wall gap is flanked by that wall continuing along the same line. Thin perpendicular walls
      // at both ends mean the "gap" is open floor between two other walls.
      if (median(track.flanks) < thickness * 0.8) return;
      const start = median(track.starts), end = median(track.ends);
      const bandMid = (track.from + to) / 2, gapMid = (start + end) / 2;
      // The model often boxes the opening's tag, so its box shape only weakly hints at orientation.
      const orientationPenalty = (vertical && wide) || (!vertical && tall) ? 1.25 : 1;
      const score = Math.hypot(bandMid - ac, gapMid - al) * orientationPenalty;
      if (score <= reach * 1.25 && (!best || score < best.score)) {
        best = { score, box: vertical ? [track.from, start, to + 1, end + 1] : [start, track.from, end + 1, to + 1] };
      }
    };
    let tracks: Track[] = [];
    const last = Math.round(ac + reach) + 1;
    for (let i = Math.round(ac - reach); i <= last + 1; i++) {
      const gaps = i <= last ? gapsAt(i) : [];
      const next: Track[] = [];
      for (const track of tracks) {
        const slack = Math.max(4, (track.gap.end - track.gap.start) * 0.15);
        const index = gaps.findIndex(gap => Math.abs(gap.start - track.gap.start) <= slack && Math.abs(gap.end - track.gap.end) <= slack);
        if (index < 0) { close(track, i - 1); continue; }
        const [gap] = gaps.splice(index, 1);
        track.starts.push(gap.start); track.ends.push(gap.end); track.flanks.push(gap.flank);
        next.push(track);
      }
      tracks = [...next, ...gaps.map(gap => ({ from: i, gap, starts: [gap.start], ends: [gap.end], flanks: [gap.flank] }))];
    }
  }
  if (!best) return undefined;
  const [bx0, by0, bx1, by1] = best.box;
  return { kind: 'BBOX', x: bx0, y: by0, width: bx1 - bx0, height: by1 - by0 };
}

function overlap(a: Geometry, b: Geometry): number {
  const [ax0, ay0, ax1, ay1] = bounds(a), [bx0, by0, bx1, by1] = bounds(b);
  const ix = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)), iy = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const area = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - ix * iy;
  return area > 0 ? (ix * iy) / area : 0;
}

/**
 * Deterministic refinement of model geometry against the drawing itself: room sides move onto the
 * nearest wall face and openings onto the nearest wall gap. Shapes with no supporting wall stay as
 * the model drew them and are reported. No measurement is derived from pixels.
 */
export function refineGeometry(output: VisionOutput, raster: GrayRaster): VisionOutput {
  const walls = new Walls(wallMask(raster), raster.width, raster.height);
  const unmatched: string[] = [];
  const elements = output.elements.map(element => {
    if (SPACE_TYPES.has(element.type)) return { ...element, geometry: snapSpace(walls, element.geometry) };
    if (!OPENING_TYPES.has(element.type)) return element;
    const geometry = snapOpening(walls, element.geometry);
    if (!geometry) unmatched.push(element.label || element.ref);
    return geometry ? { ...element, geometry } : element;
  });
  // Openings that landed on the same wall gap are one opening reported twice; keep the most
  // specific type and gather the other's labels and measurements onto it.
  const rank = (type: string) => (type === 'ENTRANCE' || type === 'EXIT' ? 3 : type === 'DOOR' ? 2 : 1);
  const merged: typeof elements = [];
  for (const element of [...elements].sort((a, b) => (OPENING_TYPES.has(b.type) ? rank(b.type) : 4) - (OPENING_TYPES.has(a.type) ? rank(a.type) : 4))) {
    const target = OPENING_TYPES.has(element.type)
      ? merged.find(other => OPENING_TYPES.has(other.type) && overlap(other.geometry, element.geometry) >= 0.5)
      : undefined;
    if (!target) { merged.push(element); continue; }
    target.label ??= element.label;
    target.labels = [...(target.labels ?? []), ...(element.labels ?? [])].slice(0, 40);
    target.measurements = [...target.measurements, ...element.measurements];
  }
  merged.sort((a, b) => elements.indexOf(a) - elements.indexOf(b));
  const warnings = unmatched.length
    ? [...output.warnings, `No wall gap found near ${unmatched.length} opening(s) (${unmatched.join(', ')}); their positions are approximate.`.slice(0, 500)]
    : output.warnings;
  return { ...output, elements: merged, warnings: warnings.slice(0, 30) };
}
