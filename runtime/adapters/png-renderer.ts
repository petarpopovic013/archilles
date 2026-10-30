import { GeometryError, type PageRenderer } from "../../src/geometry";

const PNG_SIGNATURE = "89504e470d0a1a0a";

/**
 * Interim server renderer: accepts single-page PNGs whose analysis raster equals the source
 * (up to 2048 px per edge) and returns them unchanged. JPEG/PDF rasterization needs an agreed
 * server rendering dependency (see src/geometry/README.md) and is refused with a clear code.
 */
export function createPngPassthroughRenderer(): PageRenderer {
  const dimensions = (bytes: Uint8Array) => {
    if (bytes.length < 24 || Buffer.from(bytes.subarray(0, 8)).toString("hex") !== PNG_SIGNATURE) {
      throw new GeometryError("UNRENDERABLE_PAGE");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  };
  return {
    async inspect(bytes, mime, page) {
      if (mime !== "image/png") throw new GeometryError("RENDERER_UNSUPPORTED_FORMAT");
      if (page !== 1) throw new GeometryError("INVALID_PAGE");
      return { pageCount: 1, rotation: 0, ...dimensions(bytes) };
    },
    async render(bytes, mime, _page, width, height) {
      const source = dimensions(bytes);
      if (mime !== "image/png" || source.width !== width || source.height !== height) {
        throw new GeometryError("RENDERER_UNSUPPORTED_FORMAT");
      }
      return bytes;
    },
  };
}
