import type { Drawing } from '../domain/project';
import { GeometryError } from './types';

/** Dimensions are checked before browser decoding can allocate the full bitmap. */
export function inspectImageHeader(bytes: Uint8Array, mime: Exclude<Drawing['mimeType'], 'application/pdf'>) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0, height = 0, orientation = 1;
  if (mime === 'image/png') {
    if (bytes.length < 33 || Array.from(bytes.subarray(0, 8)).join(',') !== '137,80,78,71,13,10,26,10' ||
        view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) {
      throw new GeometryError('CORRUPT_IMAGE');
    }
    width = view.getUint32(16); height = view.getUint32(20);
  } else {
    if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) throw new GeometryError('CORRUPT_IMAGE');
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) throw new GeometryError('CORRUPT_IMAGE');
      while (bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) throw new GeometryError('CORRUPT_IMAGE');
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) throw new GeometryError('CORRUPT_IMAGE');
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) throw new GeometryError('CORRUPT_IMAGE');
      if (marker === 0xe1 && length >= 8 && view.getUint32(offset + 2) === 0x45786966 && view.getUint16(offset + 6) === 0) {
        orientation = readExifOrientation(view, offset + 8, offset + length);
      }
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        if (length < 8 || width) throw new GeometryError('CORRUPT_IMAGE');
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5);
      }
      offset += length;
    }
  }
  if (!width || !height) throw new GeometryError('CORRUPT_IMAGE');
  if (width * height > 40_000_000) throw new GeometryError('PIXEL_LIMIT');
  return { width: orientation >= 5 ? height : width, height: orientation >= 5 ? width : height, orientation };
}

function readExifOrientation(view: DataView, start: number, end: number): number {
  const fail = () => { throw new GeometryError('CORRUPT_IMAGE'); };
  if (start + 8 > end) return fail();
  const order = view.getUint16(start), little = order === 0x4949;
  if ((!little && order !== 0x4d4d) || view.getUint16(start + 2, little) !== 42) return fail();
  const directory = start + view.getUint32(start + 4, little);
  if (directory < start + 8 || directory + 2 > end) return fail();
  const count = view.getUint16(directory, little);
  if (directory + 2 + count * 12 > end) return fail();
  for (let entry = directory + 2; entry < directory + 2 + count * 12; entry += 12) {
    if (view.getUint16(entry, little) !== 0x0112) continue;
    if (view.getUint16(entry + 2, little) !== 3 || view.getUint32(entry + 4, little) !== 1) return fail();
    const value = view.getUint16(entry + 8, little);
    if (value < 1 || value > 8) return fail();
    return value;
  }
  return 1;
}
