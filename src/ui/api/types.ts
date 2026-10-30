import type { z } from "zod";
import type {
  Id,
  UtcDateTime,
  Jurisdiction,
  ProjectPhase,
  AnalysisStatus,
  EvaluationStatus,
  RuleLifecycle,
  Verification,
  ElementType,
  MeasurementSource,
  CharacteristicKey,
  Metric,
  MeasurementUnit,
} from "../../domain/common";
import type {
  Project,
  Drawing,
  Floor,
  Point,
  Geometry,
  ArchitecturalElement,
  Evidence,
  Measurement,
} from "../../domain/project";
import type {
  RegulationSource,
  RegulationProvision,
  Condition,
  EvaluationDefinition,
  ComplianceRule,
  RuleExtraction,
} from "../../domain/regulation";
import type {
  RuleEvaluation,
  ComplianceFinding,
  ProjectRevision,
  ReviewAction,
  AnalysisSession,
  AgentRun,
  AgentEvent,
} from "../../domain/review";
import type { AppEventType, AppEvent } from "../../domain/events";
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  UpdateProjectResponseSchema,
  UploadDrawingMetadata,
  UploadDrawingResponseSchema,
  StartAnalysisRequest,
  StartAnalysisResponseSchema,
  MeasurementCorrectionRequest,
  MeasurementCorrectionResponseSchema,
  RecheckRequest,
  RecheckResponseSchema,
  CoverageSummary,
  AnalysisSnapshot,
  ApiError,
  ApiContractName,
} from "../../domain/api";

// Re-export all canonical domain types
export type {
  Id,
  UtcDateTime,
  Jurisdiction,
  ProjectPhase,
  AnalysisStatus,
  EvaluationStatus,
  RuleLifecycle,
  Verification,
  ElementType,
  MeasurementSource,
  CharacteristicKey,
  Metric,
  MeasurementUnit,
  Project,
  Drawing,
  Floor,
  Point,
  Geometry,
  ArchitecturalElement,
  Evidence,
  Measurement,
  RegulationSource,
  RegulationProvision,
  Condition,
  EvaluationDefinition,
  ComplianceRule,
  RuleExtraction,
  RuleEvaluation,
  ComplianceFinding,
  ProjectRevision,
  ReviewAction,
  AnalysisSession,
  AgentRun,
  AgentEvent,
  AppEventType,
  AppEvent,
  CreateProjectRequest,
  UpdateProjectRequest,
  UploadDrawingMetadata,
  StartAnalysisRequest,
  MeasurementCorrectionRequest,
  RecheckRequest,
  CoverageSummary,
  AnalysisSnapshot,
  ApiError,
  ApiContractName,
};

// Derived inferred response types matching canonical Zod schemas
export type UpdateProjectResponse = z.infer<typeof UpdateProjectResponseSchema>;
export type UploadDrawingResponse = z.infer<typeof UploadDrawingResponseSchema>;
export type StartAnalysisResponse = z.infer<typeof StartAnalysisResponseSchema>;
export type MeasurementCorrectionResponse = z.infer<typeof MeasurementCorrectionResponseSchema>;
export type RecheckResponse = z.infer<typeof RecheckResponseSchema>;

// Re-export canonical schemas, helpers and fixtures
export {
  IdSchema,
  UtcDateTimeSchema,
  FiniteNumberSchema,
  NonNegativeNumberSchema,
  PositiveNumberSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  JurisdictionSchema,
  ProjectPhaseSchema,
  AnalysisStatusSchema,
  EvaluationStatusSchema,
  RuleLifecycleSchema,
  VerificationSchema,
  ElementTypeSchema,
  MeasurementSourceSchema,
  CharacteristicKeySchema,
  MetricSchema,
  MeasurementUnitSchema,
  unitForMetric,
  isVerifiedMeasurement,
} from "../../domain/common";

export {
  ProjectSchema,
  DrawingMimeTypeSchema,
  DrawingSchema,
  PointSchema,
  BoundingBoxSchema,
  PolygonSchema,
  PolylineSchema,
  GeometrySchema,
  FloorSchema,
  ArchitecturalElementSchema,
  EvidenceSchema,
  MeasurementSchema,
  geometryFitsFloor,
} from "../../domain/project";

export {
  RegulationSourceSchema,
  RegulationProvisionSchema,
  ConditionSchema,
  EvaluationDefinitionSchema,
  ComplianceRuleSchema,
  RuleExtractionSchema,
} from "../../domain/regulation";

export {
  RuleEvaluationSchema,
  ComplianceFindingSchema,
  ProjectRevisionSchema,
  ReviewActionSchema,
  AnalysisSessionSchema,
  AgentRunSchema,
  AgentEventSchema,
} from "../../domain/review";

export {
  eventPayloadSchemas,
  AppEventEnvelopeSchema,
  parseAppEvent,
} from "../../domain/events";

export {
  CreateProjectRequestSchema,
  UpdateProjectRequestSchema,
  UpdateProjectResponseSchema,
  UploadDrawingMetadataSchema,
  UploadDrawingResponseSchema,
  StartAnalysisRequestSchema,
  StartAnalysisResponseSchema,
  MeasurementCorrectionRequestSchema,
  MeasurementCorrectionResponseSchema,
  RecheckRequestSchema,
  RecheckResponseSchema,
  CoverageSummarySchema,
  AnalysisSnapshotSchema,
  EventStreamQuerySchema,
  EventStreamItemSchema,
  ApiErrorSchema,
  apiContracts,
  ReviewProgressSchema,
} from "../../domain/api";

export { contractFixture } from "../../domain/fixtures";

/** Information for rendering a drawing page in the viewer */
export interface DrawingPageInfo {
  /** widthPx/heightPx are source-page coordinates; raster natural size can be smaller. */
  blob: Blob;
  url: string;
  widthPx: number;
  heightPx: number;
  levelLabel?: string;
}

/** Options for subscribing to ordered SSE agent events */
export interface EventStreamOptions {
  /** Resume after this sequence number (0 means from beginning) */
  after?: number;
  /** Callback for each ordered AgentEvent */
  onEvent: (event: AgentEvent) => void;
  /** Callback for stream error */
  onError?: (error: Error) => void;
  /** Callback when stream finishes */
  onComplete?: () => void;
}

/** Operational mode of the API client */
export type ApiClientMode = "mock" | "live";

/** Configuration options for initializing the API client */
export interface ApiClientConfig {
  mode?: ApiClientMode;
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

/** Central typed API client interface for Team 1 Workspace */
export interface ArchillesApiClient {
  readonly mode: ApiClientMode;
  setMode(mode: ApiClientMode): void;

  /** Create a new project with progressive metadata */
  createProject(request: CreateProjectRequest): Promise<Project>;

  /** Fetch current project state and revision */
  getProject(projectId: string): Promise<Project>;

  /** Update project metadata with revision check */
  updateProject(projectId: string, request: UpdateProjectRequest): Promise<UpdateProjectResponse>;

  /** Upload drawing file and choose initial page */
  uploadDrawing(
    projectId: string,
    file: File | Blob,
    metadata: UploadDrawingMetadata,
  ): Promise<UploadDrawingResponse>;

  /** Get relative URL for fetching drawing page image/raster */
  getDrawingPageUrl(drawingId: string, page: number): string;

  /** Fetch binary blob of the drawing page privately */
  getDrawingPageBlob(drawingId: string, page: number): Promise<Blob>;

  /** Fetch page raster blob along with known dimensions */
  getDrawingPageInfo(drawingId: string, page: number): Promise<DrawingPageInfo>;

  /** Start compliance analysis run for a selected drawing page */
  startAnalysis(projectId: string, request: StartAnalysisRequest): Promise<StartAnalysisResponse>;

  /** Fetch latest analysis snapshot (session, elements, measurements, evaluations, findings, coverage) */
  getAnalysis(sessionId: string): Promise<AnalysisSnapshot>;

  /** Fetch an evidence item by ID if known */
  getEvidence(evidenceId: string): Promise<Evidence | undefined>;

  /** Confirm or correct a measured dimension, creating a new project revision */
  correctMeasurement(
    elementId: string,
    request: MeasurementCorrectionRequest,
  ): Promise<MeasurementCorrectionResponse>;

  /** Perform hypothetical Fix & Recheck without mutating drawing or confirmed measurements */
  recheck(projectId: string, request: RecheckRequest): Promise<RecheckResponse>;

  /** Fetch full regulatory coverage breakdown */
  getCoverage(projectId: string): Promise<CoverageSummary>;

  /** Subscribe to ordered SSE agent events; returns unsubscribe cleanup function */
  subscribeToEvents(sessionId: string, options: EventStreamOptions): () => void;
}
