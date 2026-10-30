import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { inspectImageHeader } from './image-metadata';
import { GeometryError, type PageRenderer } from './types';

type PdfLoader = (bytes: Uint8Array) => Promise<PDFDocumentLoadingTask>;
/** Browser-only. Caller configures the matching PDF.js worker URL in the viewer bundle. */
export function createBrowserPageRenderer(options: { loadPdf?: PdfLoader } = {}): PageRenderer {
  async function pdf(bytes: Uint8Array) {
    const task = options.loadPdf
      ? await options.loadPdf(Uint8Array.from(bytes))
      : (await import('pdfjs-dist')).getDocument({ data: Uint8Array.from(bytes) });
    let rejectPassword!: (error: GeometryError) => void;
    const password = new Promise<never>((_, reject) => { rejectPassword = reject; });
    task.onPassword = () => rejectPassword(new GeometryError('PDF_ENCRYPTED'));
    try {
      const document = await Promise.race([task.promise, password]);
      return { document, destroy: () => task.destroy() };
    } catch (error) {
      await task.destroy().catch(() => {});
      if (error instanceof GeometryError) throw error;
      throw new GeometryError('PDF_CORRUPT');
    }
  }
  function assertPage(page: number, count: number) {
    if (!Number.isInteger(page) || page < 1 || page > count) throw new GeometryError('INVALID_PAGE');
    if (count > 20) throw new GeometryError('PAGE_LIMIT');
  }
  function assertRasterSize(width: number, height: number) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
        width > 2048 || height > 2048) throw new GeometryError('PIXEL_LIMIT');
  }
  async function selectedPage(document: PDFDocumentProxy, page: number) {
    assertPage(page, document.numPages);
    return document.getPage(page);
  }
  return {
    async inspect(bytes, mime, page) {
      if (mime !== 'application/pdf') {
        assertPage(page, 1);
        const dimensions = inspectImageHeader(bytes, mime);
        return { pageCount: 1, width: dimensions.width, height: dimensions.height, rotation: 0 };
      }
      const handle = await pdf(bytes), document = handle.document;
      try {
        const selected = await selectedPage(document, page), viewport = selected.getViewport({ scale: 2 });
        return { pageCount: document.numPages, width: Math.ceil(viewport.width), height: Math.ceil(viewport.height), rotation: selected.rotate, cropBox: selected.view };
      } finally { await handle.destroy(); }
    },
    async render(bytes, mime, page, width, height) {
      assertRasterSize(width, height);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new GeometryError('CANVAS_UNAVAILABLE');
      if (mime === 'application/pdf') {
        const handle = await pdf(bytes);
        try {
          const selected = await selectedPage(handle.document, page), base = selected.getViewport({ scale: 1 });
          const scale = width / base.width;
          await selected.render({ canvas, canvasContext: context, viewport: selected.getViewport({ scale }), transform: [1, 0, 0, height / (base.height * scale), 0, 0] }).promise;
        } finally { await handle.destroy(); }
      } else {
        assertPage(page, 1);
        const expected = inspectImageHeader(bytes, mime);
        const bitmap = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: mime }), { imageOrientation: 'from-image' });
        try {
          if (bitmap.width !== expected.width || bitmap.height !== expected.height) throw new GeometryError('IMAGE_ORIENTATION_MISMATCH');
          context.drawImage(bitmap, 0, 0, width, height);
        } finally { bitmap.close(); }
      }
      return new Uint8Array(await (await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new GeometryError('RASTER_ENCODING_FAILED')), 'image/png'))).arrayBuffer());
    },
  };
}
