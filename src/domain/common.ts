import { z } from "zod";

/** Shared wire primitives. Persist timestamps in UTC and lengths in metres. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

export const UtcDateTimeSchema = z.iso.datetime().refine(
  (value) => value.endsWith("Z"),
  "Use a UTC timestamp ending in Z",
);
export type UtcDateTime = z.infer<typeof UtcDateTimeSchema>;

export const FiniteNumberSchema = z.number().finite();
export const NonNegativeNumberSchema = FiniteNumberSchema.nonnegative();
export const PositiveNumberSchema = FiniteNumberSchema.positive();
export const NonNegativeIntegerSchema = z.number().int().nonnegative();
export const PositiveIntegerSchema = z.number().int().positive();

export const JurisdictionSchema = z.literal("RS");
export const ProjectPhaseSchema = z.enum(["CONCEPT", "DESIGN", "RECONSTRUCTION"]);
export const AnalysisStatusSchema = z.enum(["DRAFT", "RUNNING", "COMPLETE", "PARTIAL", "FAILED"]);
export const EvaluationStatusSchema = z.enum(["PASS", "FAIL", "UNKNOWN", "NOT_APPLICABLE", "NEEDS_REVIEW"]);
export const RuleLifecycleSchema = z.enum(["CANDIDATE", "AI_REVIEWED", "HUMAN_VERIFIED", "ACTIVE", "REJECTED", "SUPERSEDED"]);
export const VerificationSchema = z.enum(["UNVERIFIED", "USER_CONFIRMED", "SOURCE_VERIFIED"]);
export const ElementTypeSchema = z.enum(["ROOM", "CORRIDOR", "DOOR", "WALL", "ENTRANCE", "EXIT", "STAIR", "RAMP", "OPENING", "UNKNOWN"]);
export const MeasurementSourceSchema = z.enum(["DRAWING_LABEL", "CONFIRMED_SCALE", "AI_ESTIMATE", "USER_ENTERED", "USER_CORRECTED"]);
export const CharacteristicKeySchema = z.enum(["hasPublicAccess", "isNewBuild", "hasAccessibleRoute", "hasRamp", "hasExternalStair"]);
export const MetricSchema = z.enum(["CLEAR_WIDTH_M", "HEIGHT_M", "RISE_M", "RUN_M", "ROUTE_LENGTH_M", "FLOOR_COUNT", "OCCUPANT_COUNT", "COUNT", "SLOPE_RATIO"]);
export const MeasurementUnitSchema = z.enum(["m", "count", "ratio"]);

export type Jurisdiction = z.infer<typeof JurisdictionSchema>;
export type ProjectPhase = z.infer<typeof ProjectPhaseSchema>;
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>;
export type EvaluationStatus = z.infer<typeof EvaluationStatusSchema>;
export type RuleLifecycle = z.infer<typeof RuleLifecycleSchema>;
export type Verification = z.infer<typeof VerificationSchema>;
export type ElementType = z.infer<typeof ElementTypeSchema>;
export type MeasurementSource = z.infer<typeof MeasurementSourceSchema>;
export type CharacteristicKey = z.infer<typeof CharacteristicKeySchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type MeasurementUnit = z.infer<typeof MeasurementUnitSchema>;

export const unitForMetric = (metric: Metric): MeasurementUnit =>
  metric.endsWith("_M") ? "m" : metric === "SLOPE_RATIO" ? "ratio" : "count";

export const isVerifiedMeasurement = (verification: Verification): boolean =>
  verification === "USER_CONFIRMED" || verification === "SOURCE_VERIFIED";
