import { z } from 'zod';
import { ElementTypeSchema, MetricSchema } from '../domain/common';
import { GeometrySchema } from '../domain/project';
export const VisionOutputSchema=z.strictObject({elements:z.array(z.strictObject({
  ref:z.string().min(1).max(80), type:ElementTypeSchema, label:z.string().max(200).optional(),geometry:GeometrySchema,
  measurements:z.array(z.strictObject({metric:MetricSchema,value:z.number().nonnegative().optional(),unit:z.string().max(30).optional(),rawLabel:z.string().max(1000),geometry:GeometrySchema.optional(),confidence:z.number().min(0).max(1)})),
})).max(150),warnings:z.array(z.string().max(500)).max(30)});
export type VisionOutput=z.infer<typeof VisionOutputSchema>;
export interface VisionRunner {
  model: string;
  run(image: Uint8Array, width:number,height:number): Promise<{output:unknown;inputTokens:number;outputTokens:number;estimatedCostUsd?:number}>;
}
