import { z } from 'zod';
import { IdSchema } from './common';

export const FindingsAssessmentSchema = z.strictObject({
  phase: z.enum(['ANALYSING','SETUP','REVIEW','READY','EMPTY']),
  setupQuestionId: IdSchema.optional(),
  results: z.array(z.strictObject({findingId:IdSchema,status:z.enum(['GOOD','FAIL']),estimated:z.boolean()})),
  unresolved: z.array(z.strictObject({key:z.enum(['PROJECT','CLASSIFICATION','MEASUREMENT','INTERPRETATION','OTHER']),title:z.string(),findingIds:z.array(IdSchema),questionIds:z.array(IdSchema)})).max(5),
  excluded: z.array(z.strictObject({findingId:IdSchema,reason:z.string()})),
  summary: z.strictObject({rating:z.number().int().min(0).max(100),good:z.number().int().nonnegative(),fail:z.number().int().nonnegative(),total:z.number().int().positive(),estimated:z.number().int().nonnegative(),excluded:z.number().int().nonnegative(),attentionFindingIds:z.array(IdSchema)}).optional(),
});
export type FindingsAssessment = z.infer<typeof FindingsAssessmentSchema>;
