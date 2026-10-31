import {FindingsAssessmentSchema} from "./assessment";
import { ReviewQuestionSchema, ReviewAnswerSchema, ReviewAnswerResponseSchema } from "./questions";
import { z } from "zod";
import { GeometryReportSchema, GeometrySetupRequestSchema, GeometryPageRequestSchema, GeometryPageResponseSchema } from "./geometry";
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
  GeometrySchema,
  EvidenceSchema,
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

/**
 * Human confirmation or correction of an element's classification. An empty body confirms the
 * element as suggested; `subtype: null` clears it. Creates a new revision like any correction.
 */
export const ElementUpdateRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  type: ElementTypeSchema.optional(),
  subtype: z.string().trim().min(1).max(100).nullable().optional(),
  geometry: GeometrySchema.optional(),
});
export const ElementUpdateResponseSchema = z.strictObject({
  revision: ProjectRevisionSchema,
  element: ArchitecturalElementSchema,
});
export type ElementUpdateRequest = z.input<typeof ElementUpdateRequestSchema>;

/** Confirms several elements in one revision, e.g. the same category for every door on a floor. */
export const ElementsUpdateRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  updates: z.array(z.strictObject({
    elementId: IdSchema,
    type: ElementTypeSchema.optional(),
    subtype: z.string().trim().min(1).max(100).nullable().optional(),
    geometry: GeometrySchema.optional(),
  })).min(1).max(150),
});
export const CreateElementRequestSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema, drawingId: IdSchema, page: PositiveIntegerSchema,
  type: ElementTypeSchema, geometry: GeometrySchema, label: z.string().trim().min(1).max(200).optional(),
});
export const ElementsUpdateResponseSchema = z.strictObject({
  revision: ProjectRevisionSchema,
  elements: z.array(ArchitecturalElementSchema),
});
export type ElementsUpdateRequest = z.input<typeof ElementsUpdateRequestSchema>;

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

/**
 * What the rule registry can use, so the UI offers exactly the subtypes, measurements, and
 * classifications that rules reference instead of hardcoding regulatory strings. Catalogue
 * information only: listing a rule here does not mean it is active or applies to a project.
 */
export const RuleRequirementsSchema = z.strictObject({
  subtypes: z.array(z.strictObject({
    elementType: ElementTypeSchema,
    subtype: z.string().trim().min(1),
    rules: z.array(z.strictObject({
      ruleId: IdSchema,
      ruleVersion: PositiveIntegerSchema,
      title: z.string().trim().min(1),
      lifecycle: z.enum(["CANDIDATE", "AI_REVIEWED", "HUMAN_VERIFIED", "ACTIVE"]),
      metrics: z.array(MetricSchema),
    })).min(1),
  })),
  /** Exact `classification` values rule conditions compare against. */
  classifications: z.array(z.string().trim().min(1)),
});
export type RuleRequirements = z.infer<typeof RuleRequirementsSchema>;

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

/** Display identity of a runtime participant, so activity can name the agent behind `producerId`. */
export const ParticipantSummarySchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["AGENT", "HUMAN"]),
});
export type ParticipantSummary = z.infer<typeof ParticipantSummarySchema>;

export const AnalysisSnapshotSchema = z.strictObject({
  session: AnalysisSessionSchema,
  elements: z.array(ArchitecturalElementSchema),
  measurements: z.array(MeasurementSchema),
  geometry: GeometryReportSchema.optional(),
  questions: z.array(ReviewQuestionSchema).optional(),
  assessment: FindingsAssessmentSchema.optional(),
  evaluations: z.array(RuleEvaluationSchema),
  findings: z.array(ComplianceFindingSchema),
  coverage: CoverageSummarySchema,
  /** Additive: participants that produced, or can produce, this session's events. */
  participants: z.array(ParticipantSummarySchema).optional(),
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
  answerQuestion: { method: "POST", path: "/api/analyses/:id/questions/:questionId", request: ReviewAnswerSchema, response: ReviewAnswerResponseSchema },
  retireElement: { method: "DELETE", path: "/api/elements/:id", request: GeometryPageRequestSchema, response: ElementUpdateResponseSchema },
  createElement: { method: "POST", path: "/api/projects/:id/elements", request: CreateElementRequestSchema, response: ElementUpdateResponseSchema },
  geometrySetup: { method: "PATCH", path: "/api/drawings/:id/pages/:page/geometry", request: GeometrySetupRequestSchema, response: GeometryPageResponseSchema },
  geometryReextract: { method: "POST", path: "/api/drawings/:id/pages/:page/geometry", request: GeometryPageRequestSchema, response: GeometryPageResponseSchema },
  createProject: { method: "POST", path: "/api/projects", request: CreateProjectRequestSchema, response: ProjectSchema },
  getProject: { method: "GET", path: "/api/projects/:id", response: ProjectSchema },
  updateProject: { method: "PATCH", path: "/api/projects/:id", request: UpdateProjectRequestSchema, response: UpdateProjectResponseSchema },
  uploadDrawing: { method: "POST", path: "/api/projects/:id/drawings", request: UploadDrawingMetadataSchema, response: UploadDrawingResponseSchema },
  getDrawingPage: { method: "GET", path: "/api/drawings/:id/pages/:page", responseType: "binary" },
  getEvidence: { method: "GET", path: "/api/evidence/:id", response: EvidenceSchema },
  startAnalysis: { method: "POST", path: "/api/projects/:id/analyses", request: StartAnalysisRequestSchema, response: StartAnalysisResponseSchema },
  getAnalysis: { method: "GET", path: "/api/analyses/:id", response: AnalysisSnapshotSchema },
  streamEvents: { method: "GET", path: "/api/analyses/:id/events", request: EventStreamQuerySchema, response: EventStreamItemSchema },
  updateElement: { method: "PATCH", path: "/api/elements/:id", request: ElementUpdateRequestSchema, response: ElementUpdateResponseSchema },
  updateElements: { method: "PATCH", path: "/api/projects/:id/elements", request: ElementsUpdateRequestSchema, response: ElementsUpdateResponseSchema },
  correctMeasurement: { method: "PATCH", path: "/api/elements/:id/measurements", request: MeasurementCorrectionRequestSchema, response: MeasurementCorrectionResponseSchema },
  recheck: { method: "POST", path: "/api/projects/:id/rechecks", request: RecheckRequestSchema, response: RecheckResponseSchema },
  coverage: { method: "GET", path: "/api/projects/:id/coverage", response: CoverageSummarySchema },
  ruleRequirements: { method: "GET", path: "/api/rules/requirements", response: RuleRequirementsSchema },
} as const;

export type ApiContractName = keyof typeof apiContracts;
export type UploadDrawingMetadata = z.input<typeof UploadDrawingMetadataSchema>;
export type StartAnalysisRequest = z.input<typeof StartAnalysisRequestSchema>;
export type RecheckRequest = z.input<typeof RecheckRequestSchema>;
export type MeasurementCorrectionRequest = z.input<typeof MeasurementCorrectionRequestSchema>;

/** Statuses are explicit in API responses; no global compliance percentage. */
export const ReviewProgressSchema = z.strictObject({ status: AnalysisStatusSchema, selectedElementType: ElementTypeSchema.optional() });
