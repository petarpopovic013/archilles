import { z } from "zod";
import {
  AnalysisStatusSchema,
  CharacteristicKeySchema,
  ElementTypeSchema,
  EvaluationStatusSchema,
  IdSchema,
  JurisdictionSchema,
  MeasurementUnitSchema,
  MetricSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  ProjectPhaseSchema,
  unitForMetric,
} from "./common";
import {
  ArchitecturalElementSchema,
  DrawingSchema,
  MeasurementSchema,
  ProjectSchema,
} from "./project";
import {
  AgentEventSchema,
  AnalysisSessionSchema,
  ComplianceFindingSchema,
  ProjectRevisionSchema,
  ReviewActionSchema,
  RuleEvaluationSchema,
} from "./review";

const CharacteristicSchema = z.partialRecord(
  CharacteristicKeySchema,
  z.boolean(),
);

export const CreateProjectRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  jurisdiction: JurisdictionSchema.default("RS"),
  municipality: z.string().trim().min(1).max(120).optional(),
  purpose: z.enum(["OFFICE", "OTHER"]).default("OFFICE"),
  classification: z.string().trim().min(1).max(120).optional(),
  phase: ProjectPhaseSchema.default("CONCEPT"),
  buildingHeightM: NonNegativeNumberSchema.optional(),
  floorCount: PositiveIntegerSchema.optional(),
  occupantCount: NonNegativeIntegerSchema.optional(),
  characteristics: CharacteristicSchema.default({}),
});
export type CreateProjectRequest = z.input<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  patch: z.strictObject({
    name: z.string().trim().min(1).max(120).optional(),
    municipality: z.string().trim().min(1).max(120).nullable().optional(),
    purpose: z.enum(["OFFICE", "OTHER"]).optional(),
    classification: z.string().trim().min(1).max(120).nullable().optional(),
    phase: ProjectPhaseSchema.optional(),
    buildingHeightM: NonNegativeNumberSchema.nullable().optional(),
    floorCount: PositiveIntegerSchema.nullable().optional(),
    occupantCount: NonNegativeIntegerSchema.nullable().optional(),
    characteristics: z.partialRecord(CharacteristicKeySchema, z.boolean().nullable()).optional(),
  }).refine((patch) => Object.keys(patch).length > 0, "Patch must change at least one field"),
});
export type UpdateProjectRequest = z.input<typeof UpdateProjectRequestSchema>;
export const UpdateProjectResponseSchema = z.strictObject({ project: ProjectSchema, revision: ProjectRevisionSchema });

/** Multipart contains a binary `file`; validate metadata here and bytes in upload code. */
export const UploadDrawingMetadataSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  selectedPage: PositiveIntegerSchema.default(1),
});
export const UploadDrawingResponseSchema = z.strictObject({ drawing: DrawingSchema, pageCount: PositiveIntegerSchema });

export const StartAnalysisRequestSchema = z.strictObject({
  projectRevision: PositiveIntegerSchema,
  drawingId: IdSchema,
  page: PositiveIntegerSchema,
});
export const StartAnalysisResponseSchema = z.strictObject({ sessionId: IdSchema, status: z.literal("RUNNING") });

export const MeasurementCorrectionRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  metric: MetricSchema,
  value: NonNegativeNumberSchema,
  unit: MeasurementUnitSchema,
  evidenceIds: z.array(IdSchema),
}).refine((request) => request.unit === unitForMetric(request.metric), {
  path: ["unit"], message: "Unit does not match metric",
});
export const MeasurementCorrectionResponseSchema = z.strictObject({
  revision: ProjectRevisionSchema,
  measurement: MeasurementSchema,
});

export const RecheckRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  elementId: IdSchema,
  metric: MetricSchema,
  proposedValue: NonNegativeNumberSchema,
  unit: MeasurementUnitSchema,
}).refine((request) => request.unit === unitForMetric(request.metric), {
  path: ["unit"], message: "Unit does not match metric",
});
export const RecheckResponseSchema = z.strictObject({
  action: ReviewActionSchema,
  before: z.array(RuleEvaluationSchema),
  after: z.array(RuleEvaluationSchema),
});

export const CoverageSummarySchema = z.strictObject({
  projectId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  indexedProvisions: NonNegativeIntegerSchema,
  candidateRules: NonNegativeIntegerSchema,
  humanVerifiedRules: NonNegativeIntegerSchema,
  activeRules: NonNegativeIntegerSchema,
  applicableRules: NonNegativeIntegerSchema,
  executedChecks: NonNegativeIntegerSchema,
  blockedUnknown: NonNegativeIntegerSchema,
  needsReview: NonNegativeIntegerSchema,
  outsideAutomatedCoverage: NonNegativeIntegerSchema,
  evaluationStatusCounts: z.partialRecord(EvaluationStatusSchema, NonNegativeIntegerSchema),
  sources: z.array(z.strictObject({
    sourceId: IdSchema,
    title: z.string().min(1),
    sourceVersion: z.string().min(1),
    verificationStatus: z.enum(["CURRENT_CONFIRMED", "HISTORICAL", "CURRENT_UNCONFIRMED"]),
    considered: z.boolean(),
    reason: z.string().min(1),
  })),
});
export type CoverageSummary = z.infer<typeof CoverageSummarySchema>;

export const AnalysisSnapshotSchema = z.strictObject({
  session: AnalysisSessionSchema,
  elements: z.array(ArchitecturalElementSchema),
  measurements: z.array(MeasurementSchema),
  evaluations: z.array(RuleEvaluationSchema),
  findings: z.array(ComplianceFindingSchema),
  coverage: CoverageSummarySchema,
});
export type AnalysisSnapshot = z.infer<typeof AnalysisSnapshotSchema>;

export const EventStreamQuerySchema = z.strictObject({ after: NonNegativeIntegerSchema.default(0) });
export const EventStreamItemSchema = AgentEventSchema;

export const ApiErrorSchema = z.strictObject({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  retryable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** One source of truth for JSON route shapes. The upload route also requires file bytes. */
export const apiContracts = {
  createProject: { method: "POST", path: "/api/projects", request: CreateProjectRequestSchema, response: ProjectSchema },
  getProject: { method: "GET", path: "/api/projects/:id", response: ProjectSchema },
  updateProject: { method: "PATCH", path: "/api/projects/:id", request: UpdateProjectRequestSchema, response: UpdateProjectResponseSchema },
  uploadDrawing: { method: "POST", path: "/api/projects/:id/drawings", request: UploadDrawingMetadataSchema, response: UploadDrawingResponseSchema },
  getDrawingPage: { method: "GET", path: "/api/drawings/:id/pages/:page", responseType: "binary" },
  startAnalysis: { method: "POST", path: "/api/projects/:id/analyses", request: StartAnalysisRequestSchema, response: StartAnalysisResponseSchema },
  getAnalysis: { method: "GET", path: "/api/analyses/:id", response: AnalysisSnapshotSchema },
  streamEvents: { method: "GET", path: "/api/analyses/:id/events", request: EventStreamQuerySchema, response: EventStreamItemSchema },
  correctMeasurement: { method: "PATCH", path: "/api/elements/:id/measurements", request: MeasurementCorrectionRequestSchema, response: MeasurementCorrectionResponseSchema },
  recheck: { method: "POST", path: "/api/projects/:id/rechecks", request: RecheckRequestSchema, response: RecheckResponseSchema },
  coverage: { method: "GET", path: "/api/projects/:id/coverage", response: CoverageSummarySchema },
} as const;

export type ApiContractName = keyof typeof apiContracts;
export type UploadDrawingMetadata = z.input<typeof UploadDrawingMetadataSchema>;
export type StartAnalysisRequest = z.input<typeof StartAnalysisRequestSchema>;
export type RecheckRequest = z.input<typeof RecheckRequestSchema>;
export type MeasurementCorrectionRequest = z.input<typeof MeasurementCorrectionRequestSchema>;

/** Statuses are explicit in API responses; no global compliance percentage. */
export const ReviewProgressSchema = z.strictObject({ status: AnalysisStatusSchema, selectedElementType: ElementTypeSchema.optional() });
