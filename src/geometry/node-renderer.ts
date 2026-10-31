import { createCanvas } from '@napi-rs/canvas';
import sharp from 'sharp';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { inspectImageHeader } from './image-metadata';
import { GeometryError, type PageRenderer } from './types';

const MAX_PIXELS = 40_000_000;
const MAX_EDGE = 2048;

function assertPage(page: number, count: number) {
  if (count > 20) throw new GeometryError('PAGE_LIMIT');
  if (!Number.isInteger(page) || page < 1 || page > count) throw new GeometryError('INVALID_PAGE');
}

export async function openPdf(bytes: Uint8Array) {
  // Legacy provides the typed-array polyfills needed on the supported Node 24 runtime.
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: Uint8Array.from(bytes), stopAtErrors: true, useSystemFonts: true, disableFontFace: true });
  let rejectPassword!: (error: GeometryError) => void;
  const password = new Promise<never>((_, reject) => { rejectPassword = reject; });
  task.onPassword = () => rejectPassword(new GeometryError('PDF_ENCRYPTED'));
  try {
    return { document: await Promise.race([task.promise, password]), close: () => task.destroy() };
  } catch (error) {
    await task.destroy().catch(() => {});
    if (error instanceof GeometryError) throw error;
    throw new GeometryError('PDF_CORRUPT');
  }
}

export async function selectPdfPage(document: PDFDocumentProxy, page: number) {
  assertPage(page, document.numPages);
  const selected = await document.getPage(page);
  const source = selected.getViewport({ scale: 2 });
  const width = Math.ceil(source.width), height = Math.ceil(source.height);
  if (width <= 0 || height <= 0 || width * height > MAX_PIXELS) throw new GeometryError('PIXEL_LIMIT');
  return { selected, width, height };
}

/** Local runtime only: uploads are decoded privately, never through a browser-supplied raster. */
export function createNodePageRenderer(): PageRenderer {
  return {
    async inspect(bytes, mime, page) {
      if (mime !== 'application/pdf') {
        assertPage(page, 1);
        inspectImageHeader(bytes, mime);
        try {
          const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).metadata();
          if (metadata.format !== (mime === 'image/png' ? 'png' : 'jpeg')) throw new GeometryError('MIME_MISMATCH');
          if ((metadata.pages ?? 1) > 1) throw new GeometryError('ANIMATED_IMAGE_UNSUPPORTED');
          return { pageCount: 1, width: metadata.autoOrient.width, height: metadata.autoOrient.height, rotation: 0 };
        } catch (error) {
          if (error instanceof GeometryError) throw error;
          throw new GeometryError('CORRUPT_IMAGE');
        }
      }
      const handle = await openPdf(bytes);
      try {
        const { selected, width, height } = await selectPdfPage(handle.document, page);
        return { pageCount: handle.document.numPages, width, height, rotation: selected.rotate, cropBox: selected.view };
      } finally { await handle.close(); }
    },
    async render(bytes, mime, page, width, height) {
      if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) {
        throw new GeometryError('PIXEL_LIMIT');
      }
      if (mime !== 'application/pdf') {
        assertPage(page, 1);
        inspectImageHeader(bytes, mime);
        try {
          return await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' })
            .autoOrient().resize(width, height, { fit: 'fill' }).flatten({ background: '#ffffff' }).png().toBuffer();
        } catch { throw new GeometryError('CORRUPT_IMAGE'); }
      }
      const handle = await openPdf(bytes);
      try {
        const { selected } = await selectPdfPage(handle.document, page);
        const base = selected.getViewport({ scale: 1 }), scale = width / base.width;
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d');
        await selected.render({
          canvas: canvas as unknown as HTMLCanvasElement,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport: selected.getViewport({ scale }),
          transform: [1, 0, 0, height / (base.height * scale), 0, 0],
          background: '#ffffff',
        }).promise;
        return await canvas.encode('png');
      } catch (error) {
        if (error instanceof GeometryError) throw error;
        throw new GeometryError('UNRENDERABLE_PAGE');
      } finally { await handle.close(); }
    },
  };
}
