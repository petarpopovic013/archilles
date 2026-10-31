import sharp from 'sharp';

/** A blank PNG raster for adapter tests that never reach a real model. */
export function plainRaster(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).png().toBuffer();
}
