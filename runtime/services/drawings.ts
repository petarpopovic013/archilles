import { createHash, randomUUID } from "node:crypto";
import { DrawingSchema, FloorSchema, type Drawing } from "../../src/domain";
import { GeometryError, prepareDrawingPage } from "../../src/geometry";
import type { RuntimeContext } from "../context";
import { findDrawing, findFloor, insertDrawing, insertFloor, type FloorRecord } from "../db/repo";
import { ApiFailure, notFound, revisionConflict } from "../http/errors";
import { createAppEvent, emitAppEvent } from "../mozaik/app-events";
import { advanceRevision, getProject } from "./projects";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_PAGES = 20;

type DrawingMime = Drawing["mimeType"];

const extensions: Record<DrawingMime, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
};

/** The file signature decides the type; the declared type and extension must agree with it. */
export function detectMime(bytes: Uint8Array): DrawingMime | undefined {
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (head.toString("hex").startsWith("ffd8ff")) return "image/jpeg";
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf";
  return undefined;
}

function geometryFailure(error: unknown): ApiFailure {
  if (error instanceof GeometryError) {
    return new ApiFailure(422, error.code, "The drawing page could not be prepared", error.retryable);
  }
  return new ApiFailure(422, "UNRENDERABLE_PAGE", "The drawing page could not be prepared");
}

export interface UploadInput {
  bytes: Uint8Array;
  originalName: string;
  baseRevision: number;
  selectedPage: number;
}

/** Validates, stores privately, prepares the selected page, and records an UPLOAD revision. */
export async function uploadDrawing(ctx: RuntimeContext, projectId: string, input: UploadInput): Promise<{ drawing: Drawing; pageCount: number }> {
  const project = getProject(ctx.db, projectId);
  if (project.revision !== input.baseRevision) throw revisionConflict(project.revision, input.baseRevision);
  if (input.bytes.byteLength === 0) throw new ApiFailure(422, "EMPTY_FILE", "The uploaded file is empty");
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiFailure(413, "FILE_TOO_LARGE", "Drawings are limited to 20 MiB");

  const mimeType = detectMime(input.bytes);
  if (!mimeType) throw new ApiFailure(422, "UNSUPPORTED_FILE_TYPE", "Upload a PDF, PNG, or JPEG drawing");
  const name = input.originalName.trim().slice(0, 255) || "drawing";
  if (!extensions[mimeType].some((extension) => name.toLowerCase().endsWith(extension))) {
    throw new ApiFailure(422, "FILE_TYPE_MISMATCH", "The file extension does not match its contents");
  }

  let pageCount: number;
  try {
    pageCount = (await ctx.geometry.renderer.inspect(input.bytes, mimeType, input.selectedPage)).pageCount;
  } catch (error) {
    throw geometryFailure(error);
  }
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_PAGES) {
    throw new ApiFailure(422, "PAGE_LIMIT", `Drawings are limited to ${MAX_PAGES} pages`);
  }
  if (input.selectedPage > pageCount) throw new ApiFailure(422, "INVALID_PAGE", "The selected page does not exist");

  const storageKey = await ctx.store.write("uploads", input.bytes);
  const written: string[] = [storageKey];
  try {
    const drawing = DrawingSchema.parse({
      id: randomUUID(),
      projectId,
      revision: project.revision + 1,
      originalName: name,
      mimeType,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      storageKey,
      byteSize: input.bytes.byteLength,
      pageCount,
      selectedPage: input.selectedPage,
      uploadedAt: ctx.now(),
    });
    const floor = await prepareFloor(ctx, drawing, input.selectedPage, written);
    const revision = ctx.db.transaction(() => {
      const result = advanceRevision(ctx, getProject(ctx.db, projectId), input.baseRevision, "UPLOAD", [drawing.id]);
      insertDrawing(ctx.db, drawing);
      insertFloor(ctx.db, floor);
      return result.project.revision;
    })();
    emitAppEvent(ctx.api, createAppEvent("drawing.uploaded", {
      projectId, projectRevision: revision, correlationId: drawing.id,
    }, { drawingId: drawing.id, page: drawing.selectedPage, sha256: drawing.sha256 }));
    return { drawing, pageCount };
  } catch (error) {
    await Promise.all(written.map((key) => ctx.store.remove(key)));
    throw error;
  }
}

async function prepareFloor(ctx: RuntimeContext, drawing: Drawing, page: number, written: string[]): Promise<FloorRecord> {
  let render;
  try {
    render = await prepareDrawingPage({
      drawing,
      page,
      renderer: ctx.geometry.renderer,
      readPrivate: (key) => ctx.store.read(key),
      writePrivateRaster: async (bytes) => {
        const key = await ctx.store.write("rasters", bytes);
        written.push(key);
        return key;
      },
    });
  } catch (error) {
    throw geometryFailure(error);
  }
  const floor = FloorSchema.parse({
    id: randomUUID(),
    projectId: drawing.projectId,
    drawingId: drawing.id,
    page,
    levelLabel: `Page ${page}`,
    imageWidthPx: render.sourceWidth,
    imageHeightPx: render.sourceHeight,
  });
  return { floor, render };
}

/** The floor for a drawing page, preparing it on first use (a different page of the same upload). */
export async function ensureFloor(ctx: RuntimeContext, drawing: Drawing, page: number): Promise<FloorRecord> {
  const existing = findFloor(ctx.db, drawing.id, page);
  if (existing) return existing;
  if (page > drawing.pageCount) throw new ApiFailure(422, "INVALID_PAGE", "The selected page does not exist");
  const written: string[] = [];
  try {
    const record = await prepareFloor(ctx, drawing, page, written);
    // A concurrent request may have prepared the same page; keep the first one.
    const raced = findFloor(ctx.db, drawing.id, page);
    if (raced) {
      await Promise.all(written.map((key) => ctx.store.remove(key)));
      return raced;
    }
    insertFloor(ctx.db, record);
    return record;
  } catch (error) {
    await Promise.all(written.map((key) => ctx.store.remove(key)));
    throw error;
  }
}

/** Raster bytes of a prepared page plus its source-pixel size (the overlay coordinate frame). */
export async function readPageRaster(ctx: RuntimeContext, drawingId: string, page: number) {
  const drawing = findDrawing(ctx.db, drawingId);
  if (!drawing) throw notFound("Drawing");
  const { floor, render } = await ensureFloor(ctx, drawing, page);
  return {
    bytes: await ctx.store.read(render.rasterReference),
    sourceWidth: floor.imageWidthPx,
    sourceHeight: floor.imageHeightPx,
  };
}
