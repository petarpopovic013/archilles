import { z } from "zod";
import { IdSchema, MetricSchema, PositiveIntegerSchema } from "./common";
import { PointSchema } from "./project";

export const ReviewQuestionSchema = z.strictObject({
  id: IdSchema, key: z.string(), kind: z.enum(["UNIT", "CALIBRATION", "PROJECT", "CLASSIFICATION", "MEASUREMENT"]),
  title: z.string(), ruleIds: z.array(IdSchema), candidateIds: z.array(IdSchema),
  field: z.string().optional(), subtype: z.string().optional(), metric: MetricSchema.optional(),
  resolution: z.enum(['SELECTED','NOT_PRESENT']).optional(),
  automatic: z.boolean(), status: z.enum(["PENDING", "ANSWERED", "SKIPPED"]),
});
export type ReviewQuestion = z.infer<typeof ReviewQuestionSchema>;
export const ReviewAnswerSchema = z.strictObject({
  baseRevision: PositiveIntegerSchema,
  action: z.enum(["ANSWER", "SKIP", "DISMISS", "NOT_PRESENT"]),
  unit: z.enum(["m", "cm", "mm"]).optional(),
  points: z.array(PointSchema).length(2).optional(),
  lengthM: z.number().positive().finite().optional(),
  elementIds: z.array(IdSchema).min(1).max(150).optional(),
  value: z.union([z.string().trim().min(1).max(120), z.number().nonnegative().finite(), z.boolean()]).optional(),
});
export type ReviewAnswer = z.infer<typeof ReviewAnswerSchema>;
export const ReviewAnswerResponseSchema = z.strictObject({ projectRevision: PositiveIntegerSchema });
