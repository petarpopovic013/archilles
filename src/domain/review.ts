import { z } from "zod";
import {
  AnalysisStatusSchema,
  EvaluationStatusSchema,
  FiniteNumberSchema,
  IdSchema,
  MetricSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  UtcDateTimeSchema,
  unitForMetric,
} from "./common";

const ObservedValueSchema = z.union([FiniteNumberSchema, z.string().min(1), z.boolean()]);

export const RuleEvaluationSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  ruleId: IdSchema,
  ruleVersion: PositiveIntegerSchema,
  elementId: IdSchema.optional(),
  status: EvaluationStatusSchema,
  required: ObservedValueSchema.optional(),
  observed: ObservedValueSchema.optional(),
  unit: z.string().trim().min(1).optional(),
  evidenceIds: z.array(IdSchema),
  missingInputs: z.array(MetricSchema),
  reasonCode: z.string().trim().min(1),
  evaluatedAt: UtcDateTimeSchema,
}).superRefine((evaluation, context) => {
  if ((evaluation.status === "PASS" || evaluation.status === "FAIL") && evaluation.missingInputs.length > 0) {
    context.addIssue({ code: "custom", path: ["missingInputs"], message: "A completed check cannot have missing inputs" });
  }
  if ((evaluation.status === "PASS" || evaluation.status === "FAIL") &&
      (evaluation.observed === undefined || evaluation.required === undefined)) {
    context.addIssue({ code: "custom", path: ["observed"], message: "A completed check needs observed and required values" });
  }
});
export type RuleEvaluation = z.infer<typeof RuleEvaluationSchema>;

export const ComplianceFindingSchema = z.strictObject({
  id: IdSchema,
  evaluationId: IdSchema,
  projectId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  ruleId: IdSchema,
  ruleVersion: PositiveIntegerSchema,
  sourceId: IdSchema,
  sourceVersion: z.string().trim().min(1),
  provisionIds: z.array(IdSchema).min(1),
  elementId: IdSchema.optional(),
  status: EvaluationStatusSchema,
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  title: z.string().trim().min(1),
  explanation: z.string().trim().min(1),
  suggestedAction: z.string().trim().min(1).optional(),
  evidenceIds: z.array(IdSchema),
  requiresHumanReview: z.boolean(),
  stale: z.boolean(),
  createdAt: UtcDateTimeSchema,
});
export type ComplianceFinding = z.infer<typeof ComplianceFindingSchema>;

export const ProjectRevisionSchema = z.strictObject({
  projectId: IdSchema,
  revision: PositiveIntegerSchema,
  parentRevision: PositiveIntegerSchema.optional(),
  kind: z.enum(["UPLOAD", "METADATA", "GEOMETRY_CORRECTION", "MEASUREMENT_CORRECTION"]),
  changedEntityIds: z.array(IdSchema),
  createdBy: z.string().trim().min(1),
  createdAt: UtcDateTimeSchema,
}).refine((revision) => revision.parentRevision === undefined || revision.parentRevision < revision.revision, {
  path: ["parentRevision"], message: "Parent revision must be earlier",
});
export type ProjectRevision = z.infer<typeof ProjectRevisionSchema>;

export const ReviewActionSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  baseRevision: PositiveIntegerSchema,
  elementId: IdSchema,
  metric: MetricSchema,
  previousMeasurementId: IdSchema.optional(),
  proposedValue: FiniteNumberSchema.nonnegative(),
  unit: z.enum(["m", "count", "ratio"]),
  outcome: z.array(RuleEvaluationSchema),
  hypothetical: z.literal(true),
  createdAt: UtcDateTimeSchema,
}).refine((action) => action.unit === unitForMetric(action.metric), {
  path: ["unit"], message: "Unit does not match metric",
});
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

export const AnalysisSessionSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  status: AnalysisStatusSchema,
  selectedRuleIds: z.array(IdSchema),
  agentRunIds: z.array(IdSchema),
  startedAt: UtcDateTimeSchema,
  finishedAt: UtcDateTimeSchema.optional(),
  errorCode: z.string().trim().min(1).optional(),
});
export type AnalysisSession = z.infer<typeof AnalysisSessionSchema>;

export const AgentRunSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  participantId: IdSchema,
  role: z.enum(["GEOMETRY", "REGULATION", "REVIEW", "RULE_EXTRACTION", "RULE_VALIDATION"]),
  status: z.enum(["STARTED", "COMPLETED", "FAILED", "CANCELLED"]),
  model: z.string().trim().min(1).optional(),
  inputTokens: NonNegativeIntegerSchema.optional(),
  outputTokens: NonNegativeIntegerSchema.optional(),
  estimatedCostUsd: FiniteNumberSchema.nonnegative().optional(),
  errorCode: z.string().trim().min(1).optional(),
  startedAt: UtcDateTimeSchema,
  finishedAt: UtcDateTimeSchema.optional(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

/** Persisted observer record; use AppEventSchema in events.ts for live payloads. */
export const AgentEventSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  sequence: PositiveIntegerSchema,
  type: z.string().trim().min(1),
  producerId: IdSchema,
  payload: z.unknown(),
  occurredAt: UtcDateTimeSchema,
});
export type AgentEvent = z.infer<typeof AgentEventSchema>;
