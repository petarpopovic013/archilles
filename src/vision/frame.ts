import sharp from 'sharp';
import type { Geometry } from '../domain/project';
import type { GrayRaster } from '../geometry/refine';
import type { VisionOutput } from './schema';

/** Models that take high-resolution images (2576px long edge, 3.75MP) with 1:1 pixel coordinates. */
const HIGH_RES_MODEL = /^claude-(opus-4-[78]|opus-5|sonnet-5|fable|mythos)/;
const MAX_UPSCALE = 3;
/** White border that carries the coordinate rulers, in frame pixels. */
const MARGIN = 34;
/** Model coordinates slightly past the drawing edge are clamped; anything further stays invalid. */
const EDGE_TOLERANCE = 0.02;

/** Drawing size inside the image sent to the model; the image adds `margin` on every side. */
export interface VisionFrame { width: number; height: number; margin: number; gridStep: number }

/**
 * The largest framed image the API passes to the model without downsizing it. A larger image would
 * be resized server-side and the model would answer in coordinates of an image we never described.
 * Small plans are upscaled so their annotations stay legible.
 */
export function visionFrame(model: string, width: number, height: number): VisionFrame {
  const { edge, area } = HIGH_RES_MODEL.test(model) ? { edge: 2576, area: 3_750_000 } : { edge: 1568, area: 1_150_000 };
  const fits = (scale: number) => {
    const w = Math.floor(width * scale) + 2 * MARGIN, h = Math.floor(height * scale) + 2 * MARGIN;
    return Math.ceil(w / 28) * 28 <= edge && Math.ceil(h / 28) * 28 <= edge && Math.ceil(w / 28) * Math.ceil(h / 28) <= (edge === 1568 ? 1568 : 4784) && w * h <= area;
  };
  let scale = Math.min(MAX_UPSCALE, (edge - 2 * MARGIN) / Math.max(width, height), Math.sqrt(area / (width * height)));
  while (scale > 0.01 && !fits(scale)) scale *= 0.99;
  const w = Math.max(1, Math.floor(width * scale)), h = Math.max(1, Math.floor(height * scale));
  return { width: w, height: h, margin: MARGIN, gridStep: niceStep(Math.max(w, h) / 14) };
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(f => f * power).find(step => step >= raw) ?? 10 * power;
}

/** Plan scaled to the frame, with rulers in the margin that state drawing coordinates. */
export async function renderVisionFrame(png: Uint8Array, frame: VisionFrame): Promise<Buffer> {
  const { width, height, margin: m, gridStep } = frame;
  const plan = await sharp(png).resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
    .extend({ top: m, bottom: m, left: m, right: m, background: '#ffffff' }).png().toBuffer();
  const W = width + 2 * m, H = height + 2 * m, color = '#d0108f';
  let svg = `<rect x="${m}" y="${m}" width="${width}" height="${height}" fill="none" stroke="${color}" stroke-width="1"/>`;
  const label = (x: number, y: number, text: number, anchor: string) =>
    `<text x="${x}" y="${y}" font-size="12" font-family="Arial, Helvetica, sans-serif" fill="${color}" text-anchor="${anchor}">${text}</text>`;
  const tick = (x1: number, y1: number, x2: number, y2: number) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`;
  for (let v = gridStep; v < width; v += gridStep) {
    svg += tick(m + v, m - 5, m + v, m) + tick(m + v, H - m, m + v, H - m + 5);
    svg += label(m + v, m - 8, v, 'middle') + label(m + v, H - m + 18, v, 'middle');
  }
  for (let v = gridStep; v < height; v += gridStep) {
    svg += tick(m - 5, m + v, m, m + v) + tick(W - m, m + v, W - m + 5, m + v);
    svg += label(m - 7, m + v + 4, v, 'end') + label(W - m + 7, m + v + 4, v, 'start');
  }
  svg += label(m - 4, m - 8, 0, 'end');
  return sharp(plan).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`) }]).png().toBuffer();
}

export async function grayRaster(png: Uint8Array): Promise<GrayRaster> {
  const { data, info } = await sharp(png).flatten({ background: '#ffffff' }).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** Drops elements the model placed outside the drawing, and stray label or measurement geometry. */
export function withinRaster(output: VisionOutput, width: number, height: number): VisionOutput {
  const fits = (g: Geometry) => (g.kind === 'BBOX' ? [{ x: g.x, y: g.y }, { x: g.x + g.width, y: g.y + g.height }] : g.points)
    .every(({ x, y }) => x >= 0 && y >= 0 && x <= width && y <= height);
  const elements = output.elements.filter(element => fits(element.geometry)).map(element => ({
    ...element,
    labels: element.labels?.filter(label => fits(label.geometry)),
    measurements: element.measurements.map(({ geometry, ...m }) => (geometry && fits(geometry) ? { ...m, geometry } : m)),
  }));
  const dropped = output.elements.length - elements.length;
  return { ...output, elements, ...(output.annotations ? { annotations: output.annotations.filter(a => fits(a.geometry)) } : {}), warnings: dropped ? [`${dropped} element(s) placed outside the drawing were discarded.`, ...output.warnings].slice(0,30) : output.warnings };
}

/** Maps model geometry from drawing-frame coordinates back to raster pixels. */
export function frameToRaster(output: VisionOutput, frame: VisionFrame, width: number, height: number): VisionOutput {
  const sx = width / frame.width, sy = height / frame.height;
  const clamp = (value: number, max: number) => value < 0 && value >= -max * EDGE_TOLERANCE ? 0 : value > max && value <= max * (1 + EDGE_TOLERANCE) ? max : value;
  const point = (p: { x: number; y: number }) => ({ x: clamp(p.x * sx, width), y: clamp(p.y * sy, height) });
  const geometry = (g: Geometry): Geometry => {
    if (g.kind !== 'BBOX') return { ...g, points: g.points.map(point) };
    const a = point({ x: g.x, y: g.y }), b = point({ x: g.x + g.width, y: g.y + g.height });
    return { kind: 'BBOX', x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  };
  return {
    ...output,
    elements: output.elements.map(element => ({
      ...element,
      geometry: geometry(element.geometry),
      labels: element.labels?.map(label => ({ ...label, geometry: geometry(label.geometry) })),
      measurements: element.measurements.map(m => (m.geometry ? { ...m, geometry: geometry(m.geometry) } : m)),
    })),
  };
}
