import { z } from "zod";
import {
  ElementTypeSchema,
  EvaluationStatusSchema,
  IdSchema,
  MetricSchema,
  NonNegativeIntegerSchema,
  PositiveIntegerSchema,
  UtcDateTimeSchema,
} from "./common";

/** Application events carried by Mozaik SemanticEvent; these are not Mozaik built-ins. */
export const eventPayloadSchemas = {
  "project.created": z.strictObject({}),
  "drawing.uploaded": z.strictObject({ drawingId: IdSchema, page: PositiveIntegerSchema, sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
  "analysis.started": z.strictObject({ drawingId: IdSchema, page: PositiveIntegerSchema, ruleSetVersion: z.string().min(1) }),
  "geometry.stage.completed": z.strictObject({ stage: z.enum(["OVERVIEW", "AWAITING_CONFIRMATION", "DETAILS", "RECONSTRUCTION", "VALIDATION", "COMPLETE", "PARTIAL"]), calls: NonNegativeIntegerSchema, regionCount: NonNegativeIntegerSchema }),
  "geometry.extraction.started": z.strictObject({ agentRunId: IdSchema, cacheKey: z.string().min(1) }),
  "geometry.extraction.completed": z.strictObject({ elementIds: z.array(IdSchema), measurementIds: z.array(IdSchema), evidenceIds: z.array(IdSchema) }),
  "geometry.measurement.missing": z.strictObject({ elementId: IdSchema, metric: MetricSchema, reason: z.string().min(1) }),
  "geometry.measurement.updated": z.strictObject({ measurementId: IdSchema, elementId: IdSchema, metric: MetricSchema }),
  "regulation.applicability.requested": z.strictObject({
    classificationFacts: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
    elementTypes: z.array(ElementTypeSchema),
  }),
  "regulation.rules.selected": z.strictObject({ ruleIds: z.array(IdSchema), explanations: z.record(z.string(), z.string()), missingContext: z.array(z.string()) }),
  "regulation.input.required": z.strictObject({ field: z.string().min(1), reason: z.string().min(1), affectedRuleIds: z.array(IdSchema) }),
  "rule.evaluation.requested": z.strictObject({ ruleIds: z.array(IdSchema), elementIds: z.array(IdSchema), inputFingerprint: z.string().min(1) }),
  "rule.evaluation.completed": z.strictObject({ evaluationIds: z.array(IdSchema), statusCounts: z.partialRecord(EvaluationStatusSchema, NonNegativeIntegerSchema) }),
  "review.finding.created": z.strictObject({ findingId: IdSchema, evaluationId: IdSchema }),
  "review.finding.updated": z.strictObject({ findingId: IdSchema, evaluationId: IdSchema }),
  "review.human_verification.required": z.strictObject({ findingId: IdSchema, reason: z.string().min(1), missingEvidenceIds: z.array(IdSchema) }),
  "project.revision.created": z.strictObject({ newRevision: PositiveIntegerSchema, changedEntityIds: z.array(IdSchema) }),
  "agent.run.failed": z.strictObject({ agentRunId: IdSchema, errorCode: z.string().min(1), retryable: z.boolean() }),
} as const;

export type AppEventType = keyof typeof eventPayloadSchemas;
export type AppEvent<T extends AppEventType = AppEventType> = {
  [K in T]: {
    eventId: string;
    type: K;
    projectId: string;
    projectRevision: number;
    correlationId: string;
    sessionId?: string;
    occurredAt: string;
    payload: z.infer<(typeof eventPayloadSchemas)[K]>;
  }
}[T];

export const AppEventEnvelopeSchema = z.strictObject({
  eventId: IdSchema,
  type: z.string().min(1),
  projectId: IdSchema,
  projectRevision: PositiveIntegerSchema,
  correlationId: IdSchema,
  sessionId: IdSchema.optional(),
  occurredAt: UtcDateTimeSchema,
  payload: z.unknown(),
});

/** Validates both envelope and the payload selected by event type. */
export function parseAppEvent(value: unknown): AppEvent {
  const envelope = AppEventEnvelopeSchema.parse(value);
  if (!Object.hasOwn(eventPayloadSchemas, envelope.type)) {
    throw new Error(`Unknown application event type: ${envelope.type}`);
  }
  const type = envelope.type as AppEventType;
  const payload = eventPayloadSchemas[type].parse(envelope.payload);
  return { ...envelope, type, payload } as AppEvent;
}
