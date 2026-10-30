import {
  CreateProjectRequestSchema,
  IdSchema,
  MeasurementCorrectionRequestSchema,
  PositiveIntegerSchema,
  RecheckRequestSchema,
  StartAnalysisRequestSchema,
  UpdateProjectRequestSchema,
  UploadDrawingMetadataSchema,
} from "../../src/domain";
import type { RuntimeContext } from "../context";
import { findSession } from "../db/repo";
import { computeCoverage, getAnalysisSnapshot, startAnalysis } from "../services/analyses";
import { readPageRaster, uploadDrawing } from "../services/drawings";
import { correctElementMeasurement, recheckProposal } from "../services/measurements";
import { createProject, getProject, updateProject } from "../services/projects";
import { ApiFailure, invalidInput, notFound } from "./errors";
import { Router } from "./server";
import { readMultipart, streamSessionEvents } from "./streams";

/** Opaque IDs are UUIDs; anything else cannot exist, so it is a 404 rather than a lookup. */
function idParam(value: string, entity: string): string {
  if (!IdSchema.safeParse(value).success) throw notFound(entity);
  return value;
}

function sequenceParam(value: string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new ApiFailure(422, "INVALID_INPUT", "`after` must be a non-negative integer");
  return parsed;
}

/** Runtime routes mirror the public `/api` contract in Tech.MD §5 and `apiContracts`. */
export function createRouter(ctx: RuntimeContext): Router {
  return new Router()
    .add("GET", "/health", () => ({ status: "ok" }))
    .add("POST", "/api/projects", async (req) =>
      createProject(ctx, await req.json(CreateProjectRequestSchema)), 201)
    .add("GET", "/api/projects/:id", (req) =>
      getProject(ctx.db, idParam(req.params.id, "Project")))
    .add("PATCH", "/api/projects/:id", async (req) =>
      updateProject(ctx, idParam(req.params.id, "Project"), await req.json(UpdateProjectRequestSchema)))

    .add("POST", "/api/projects/:id/drawings", async (req) => {
      const projectId = idParam(req.params.id, "Project");
      const form = await readMultipart(req.raw);
      const file = form.get("file");
      if (!(file instanceof Blob)) throw new ApiFailure(422, "INVALID_INPUT", "A `file` field is required");
      const metadata = UploadDrawingMetadataSchema.safeParse({
        baseRevision: Number(form.get("baseRevision")),
        ...(form.has("selectedPage") ? { selectedPage: Number(form.get("selectedPage")) } : {}),
      });
      if (!metadata.success) throw invalidInput(metadata.error);
      return uploadDrawing(ctx, projectId, {
        bytes: new Uint8Array(await file.arrayBuffer()),
        originalName: file instanceof File ? file.name : "drawing",
        baseRevision: metadata.data.baseRevision,
        selectedPage: metadata.data.selectedPage,
      });
    }, 201)
    .add("GET", "/api/drawings/:id/pages/:page", async (req, res) => {
      const page = PositiveIntegerSchema.safeParse(Number(req.params.page));
      if (!page.success) throw notFound("Page");
      const raster = await readPageRaster(ctx, idParam(req.params.id, "Drawing"), page.data);
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": raster.bytes.byteLength,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-source-width": String(raster.sourceWidth),
        "x-source-height": String(raster.sourceHeight),
      });
      res.end(raster.bytes);
    })

    .add("POST", "/api/projects/:id/analyses", async (req) =>
      startAnalysis(ctx, idParam(req.params.id, "Project"), await req.json(StartAnalysisRequestSchema)), 202)
    .add("GET", "/api/analyses/:id", (req) =>
      getAnalysisSnapshot(ctx, idParam(req.params.id, "Analysis")))
    .add("GET", "/api/analyses/:id/events", (req, res) => {
      const sessionId = idParam(req.params.id, "Analysis");
      if (!findSession(ctx.db, sessionId)) throw notFound("Analysis");
      const header = req.headers["last-event-id"];
      const after = Math.max(sequenceParam(req.query.get("after")), sequenceParam(Array.isArray(header) ? header[0] : header));
      streamSessionEvents(ctx, sessionId, after, req.raw, res);
    })

    .add("PATCH", "/api/elements/:id/measurements", async (req) =>
      correctElementMeasurement(ctx, idParam(req.params.id, "Element"), await req.json(MeasurementCorrectionRequestSchema)))
    .add("POST", "/api/projects/:id/rechecks", async (req) =>
      recheckProposal(ctx, idParam(req.params.id, "Project"), await req.json(RecheckRequestSchema)))
    .add("GET", "/api/projects/:id/coverage", (req) =>
      computeCoverage(ctx, getProject(ctx.db, idParam(req.params.id, "Project")).id));
}
