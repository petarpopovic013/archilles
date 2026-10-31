import type { z } from "zod";
import {
  AnalysisSnapshotSchema,
  ApiErrorSchema,
  CoverageSummarySchema,
  CreateProjectRequestSchema,
  ElementUpdateRequestSchema,
  ElementUpdateResponseSchema,
  EvidenceSchema,
  MeasurementCorrectionRequestSchema,
  MeasurementCorrectionResponseSchema,
  ProjectSchema,
  RecheckRequestSchema,
  RecheckResponseSchema,
  RuleRequirementsSchema,
  StartAnalysisRequestSchema,
  StartAnalysisResponseSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  UploadDrawingMetadataSchema,
  UploadDrawingResponseSchema,
  type AnalysisSnapshot,
  type CoverageSummary,
  type CreateProjectRequest,
  type ElementUpdateRequest,
  type Evidence,
  type MeasurementCorrectionRequest,
  type Project,
  type RecheckRequest,
  type RuleRequirements,
  type StartAnalysisRequest,
  type UpdateProjectRequest,
  type UploadDrawingMetadata,
} from "../../domain";
import { ArchillesApiError } from "./errors";
import { followEvents, type EventSubscription } from "./sse";

export interface ApiClientConfig {
  /** Origin of the Next.js app; empty means same-origin. */
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/** A prepared page raster plus the source-pixel frame that element geometry uses. */
export interface DrawingPageInfo {
  blob: Blob;
  url: string;
  /** Source-page size; the raster itself may be smaller if it was resized for analysis. */
  widthPx: number;
  heightPx: number;
}

const MAX_SOURCE_PIXELS = 40_000_000;
const fallbackNames: Record<string, string> = {
  "image/png": "drawing.png",
  "image/jpeg": "drawing.jpg",
  "application/pdf": "drawing.pdf",
};

const id = (value: string) => encodeURIComponent(value);

/** Typed client for the same-origin `/api` routes. Requests and responses use the shared schemas. */
export class HttpArchillesApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = config.baseUrl?.replace(/\/+$/, "") ?? "";
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  createProject(request: CreateProjectRequest): Promise<Project> {
    return this.json("POST", "/api/projects", ProjectSchema, CreateProjectRequestSchema.parse(request));
  }

  getProject(projectId: string): Promise<Project> {
    return this.json("GET", `/api/projects/${id(projectId)}`, ProjectSchema);
  }

  updateProject(projectId: string, request: UpdateProjectRequest) {
    return this.json("PATCH", `/api/projects/${id(projectId)}`, UpdateProjectResponseSchema, UpdateProjectRequestSchema.parse(request));
  }

  async uploadDrawing(projectId: string, file: Blob, metadata: UploadDrawingMetadata) {
    const meta = UploadDrawingMetadataSchema.parse(metadata);
    const form = new FormData();
    const name = typeof File !== "undefined" && file instanceof File ? file.name : fallbackNames[file.type] ?? "drawing";
    form.append("file", file, name);
    form.append("baseRevision", String(meta.baseRevision));
    form.append("selectedPage", String(meta.selectedPage));
    return UploadDrawingResponseSchema.parse(await this.read(await this.send(`/api/projects/${id(projectId)}/drawings`, { method: "POST", body: form })));
  }

  getDrawingPageUrl(drawingId: string, page: number): string {
    return `${this.baseUrl}/api/drawings/${id(drawingId)}/pages/${page}`;
  }

  /** The page raster and its source frame, taken from the `x-source-*` headers, never guessed. */
  async getDrawingPageInfo(drawingId: string, page: number): Promise<DrawingPageInfo> {
    const response = await this.send(`/api/drawings/${id(drawingId)}/pages/${page}`, { method: "GET" });
    if (!response.ok) await this.read(response);
    const widthPx = Number(response.headers.get("x-source-width"));
    const heightPx = Number(response.headers.get("x-source-height"));
    if (!Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx) || widthPx <= 0 || heightPx <= 0 || widthPx * heightPx > MAX_SOURCE_PIXELS) {
      throw new ArchillesApiError(502, { code: "PAGE_DIMENSIONS_INVALID", message: "The page response is missing valid source dimensions", retryable: false });
    }
    const blob = await response.blob();
    return { blob, url: URL.createObjectURL(blob), widthPx, heightPx };
  }

  startAnalysis(projectId: string, request: StartAnalysisRequest) {
    return this.json("POST", `/api/projects/${id(projectId)}/analyses`, StartAnalysisResponseSchema, StartAnalysisRequestSchema.parse(request));
  }

  getAnalysis(sessionId: string): Promise<AnalysisSnapshot> {
    return this.json("GET", `/api/analyses/${id(sessionId)}`, AnalysisSnapshotSchema);
  }

  getEvidence(evidenceId: string): Promise<Evidence> {
    return this.json("GET", `/api/evidence/${id(evidenceId)}`, EvidenceSchema);
  }

  correctMeasurement(elementId: string, request: MeasurementCorrectionRequest) {
    return this.json("PATCH", `/api/elements/${id(elementId)}/measurements`, MeasurementCorrectionResponseSchema,
      MeasurementCorrectionRequestSchema.parse(request));
  }

  updateElement(elementId: string, request: ElementUpdateRequest) {
    return this.json("PATCH", `/api/elements/${id(elementId)}`, ElementUpdateResponseSchema, ElementUpdateRequestSchema.parse(request));
  }

  recheck(projectId: string, request: RecheckRequest) {
    return this.json("POST", `/api/projects/${id(projectId)}/rechecks`, RecheckResponseSchema, RecheckRequestSchema.parse(request));
  }

  getCoverage(projectId: string): Promise<CoverageSummary> {
    return this.json("GET", `/api/projects/${id(projectId)}/coverage`, CoverageSummarySchema);
  }

  getRuleRequirements(): Promise<RuleRequirements> {
    return this.json("GET", "/api/rules/requirements", RuleRequirementsSchema);
  }

  /** Stored agent events for a session, in order, resuming automatically after a dropped stream. */
  subscribeToEvents(sessionId: string, subscription: EventSubscription): () => void {
    return followEvents((after) => `${this.baseUrl}/api/analyses/${id(sessionId)}/events?after=${after}`, this.fetchFn, subscription);
  }

  private async json<S extends z.ZodType>(method: string, path: string, schema: S, body?: unknown): Promise<z.output<S>> {
    const response = await this.send(path, {
      method,
      ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
    return schema.parse(await this.read(response));
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(`${this.baseUrl}${path}`, { ...init, cache: "no-store" });
    } catch {
      throw new ArchillesApiError(503, { code: "NETWORK_ERROR", message: "The server could not be reached", retryable: true });
    }
  }

  private async read(response: Response): Promise<unknown> {
    const payload: unknown = await response.json().catch(() => undefined);
    if (response.ok) return payload;
    const error = ApiErrorSchema.safeParse(payload);
    throw new ArchillesApiError(response.status, error.success
      ? error.data
      : { code: `HTTP_${response.status}`, message: response.statusText || "Request failed", retryable: response.status >= 500 });
  }
}
