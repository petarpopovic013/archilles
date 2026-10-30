import { z } from "zod";
import {
  CharacteristicKeySchema,
  ElementTypeSchema,
  FiniteNumberSchema,
  IdSchema,
  JurisdictionSchema,
  MetricSchema,
  PositiveIntegerSchema,
  RuleLifecycleSchema,
  UtcDateTimeSchema,
  VerificationSchema,
  unitForMetric,
} from "./common";

const CalendarDateSchema = z.iso.date();
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const RegulationSourceSchema = z.strictObject({
  id: IdSchema,
  title: z.string().trim().min(1),
  jurisdiction: JurisdictionSchema,
  category: z.string().trim().min(1),
  publicationReference: z.string().trim().min(1),
  officialUrl: z.url(),
  retrievedAt: UtcDateTimeSchema,
  originalPublishedAt: CalendarDateSchema.optional(),
  effectiveFrom: CalendarDateSchema.optional(),
  effectiveTo: CalendarDateSchema.optional(),
  amendmentReferences: z.array(z.string().trim().min(1)),
  sourceVersion: z.string().trim().min(1),
  sha256: HashSchema.optional(),
  status: z.enum(["CURRENT_CONFIRMED", "HISTORICAL", "CURRENT_UNCONFIRMED"]),
  verifiedBy: z.string().trim().min(1).optional(),
  verifiedAt: UtcDateTimeSchema.optional(),
}).superRefine((source, context) => {
  if (source.status === "CURRENT_CONFIRMED" && (!source.verifiedBy || !source.verifiedAt)) {
    context.addIssue({ code: "custom", path: ["status"], message: "Current status requires reviewer and date" });
  }
});
export type RegulationSource = z.infer<typeof RegulationSourceSchema>;

export const RegulationProvisionSchema = z.strictObject({
  id: IdSchema,
  sourceId: IdSchema,
  sourceVersion: z.string().trim().min(1),
  article: z.string().trim().min(1),
  paragraph: z.string().trim().min(1).optional(),
  item: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  location: z.string().trim().min(1).optional(),
  crossReferenceIds: z.array(IdSchema),
  externalStandardRefs: z.array(z.string().trim().min(1)),
  verification: VerificationSchema,
});
export type RegulationProvision = z.infer<typeof RegulationProvisionSchema>;

export type Condition =
  | { op: "EQ" | "IN"; field: "jurisdiction" | "purpose" | "phase" | "classification" | "element.type" | "element.subtype"; value: string | string[] }
  | { op: "EQ"; field: "characteristic"; key: z.infer<typeof CharacteristicKeySchema>; value: boolean }
  | { op: "GTE" | "LTE"; field: "buildingHeightM" | "floorCount" | "occupantCount"; value: number }
  | { op: "ALL" | "ANY"; children: Condition[] };

const EnumConditionSchema = z.strictObject({
  op: z.enum(["EQ", "IN"]),
  field: z.enum(["jurisdiction", "purpose", "phase", "classification", "element.type", "element.subtype"]),
  value: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
}).superRefine((condition, context) => {
  if (condition.op === "IN" && !Array.isArray(condition.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "IN requires an array" });
  }
  if (condition.op === "EQ" && Array.isArray(condition.value)) {
    context.addIssue({ code: "custom", path: ["value"], message: "EQ requires one value" });
  }
});
const CharacteristicConditionSchema = z.strictObject({
  op: z.literal("EQ"), field: z.literal("characteristic"),
  key: CharacteristicKeySchema, value: z.boolean(),
});
const NumericConditionSchema = z.strictObject({
  op: z.enum(["GTE", "LTE"]),
  field: z.enum(["buildingHeightM", "floorCount", "occupantCount"]),
  value: FiniteNumberSchema,
});

export const ConditionSchema: z.ZodType<Condition> = z.lazy(() => z.union([
  EnumConditionSchema,
  CharacteristicConditionSchema,
  NumericConditionSchema,
  z.strictObject({ op: z.enum(["ALL", "ANY"]), children: z.array(ConditionSchema).min(1).max(20) }),
]));

export const EvaluationDefinitionSchema = z.union([
  z.strictObject({ kind: z.enum(["MIN", "MAX"]), metric: MetricSchema, threshold: FiniteNumberSchema, unit: z.enum(["m", "count", "ratio"]) }),
  z.strictObject({ kind: z.literal("BOOL"), field: CharacteristicKeySchema, expected: z.boolean() }),
  z.strictObject({ kind: z.enum(["COUNT_MIN", "COUNT_MAX"]), elementType: ElementTypeSchema, threshold: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal("REVIEWED_EVALUATOR"), evaluatorId: z.string().trim().min(1), version: z.string().trim().min(1) }),
]).superRefine((definition, context) => {
  if (definition.kind !== "MIN" && definition.kind !== "MAX") return;
  const expected = unitForMetric(definition.metric);
  if (definition.unit !== expected) {
    context.addIssue({ code: "custom", path: ["unit"], message: `Expected ${expected} for ${definition.metric}` });
  }
});
export type EvaluationDefinition = z.infer<typeof EvaluationDefinitionSchema>;

export const ComplianceRuleSchema = z.strictObject({
  id: IdSchema,
  version: PositiveIntegerSchema,
  sourceId: IdSchema,
  sourceVersion: z.string().trim().min(1),
  provisionIds: z.array(IdSchema).min(1),
  title: z.string().trim().min(1),
  lifecycle: RuleLifecycleSchema,
  elementType: ElementTypeSchema,
  applicability: ConditionSchema,
  exceptionConditions: z.array(ConditionSchema),
  requiredInputs: z.array(MetricSchema),
  evaluation: EvaluationDefinitionSchema,
  effectiveFrom: CalendarDateSchema.optional(),
  effectiveTo: CalendarDateSchema.optional(),
  approvedBy: z.string().trim().min(1).optional(),
  approvedAt: UtcDateTimeSchema.optional(),
  testFixtureIds: z.array(IdSchema),
  interpretationNotes: z.array(z.string().trim().min(1)),
}).superRefine((rule, context) => {
  if (rule.lifecycle === "HUMAN_VERIFIED" || rule.lifecycle === "ACTIVE") {
    if (!rule.approvedBy || !rule.approvedAt) {
      context.addIssue({ code: "custom", path: ["approvedBy"], message: "Human verification requires reviewer and date" });
    }
  }
  if (rule.lifecycle === "ACTIVE" && rule.testFixtureIds.length === 0) {
    context.addIssue({ code: "custom", path: ["testFixtureIds"], message: "Active rules require tested fixtures" });
  }
});
export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;

export const RuleExtractionSchema = z.strictObject({
  id: IdSchema,
  sourceId: IdSchema,
  sourceVersion: z.string().trim().min(1),
  provisionIds: z.array(IdSchema).min(1),
  candidateRuleId: IdSchema,
  extractingAgentRunId: IdSchema,
  validatingAgentRunId: IdSchema.optional(),
  validation: z.enum(["PENDING", "SUPPORTED", "CHALLENGED"]),
  issues: z.array(z.string().trim().min(1)),
  createdAt: UtcDateTimeSchema,
});
export type RuleExtraction = z.infer<typeof RuleExtractionSchema>;
