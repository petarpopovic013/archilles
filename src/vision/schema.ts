import { z } from 'zod';
import { ElementTypeSchema, MetricSchema } from '../domain/common';
import { GeometrySchema } from '../domain/project';
const VisionElementSchema=z.strictObject({
  ref:z.string().min(1).max(80), type:ElementTypeSchema, label:z.string().max(200).optional(), subtype:z.string().max(100).optional(),geometry:GeometrySchema,
  labels:z.array(z.strictObject({text:z.string().min(1).max(1000),geometry:GeometrySchema})).max(40).optional(),
  measurements:z.array(z.strictObject({metric:MetricSchema,value:z.number().nonnegative().optional(),unit:z.string().max(30).optional(),rawLabel:z.string().max(1000),geometry:GeometrySchema.optional(),confidence:z.number().min(0).max(1),dimensionKind:z.enum(['MEASURED_SPAN','NOMINAL_OPENING','UNCERTAIN']).optional()})),
});
export const VisionOutputSchema=z.strictObject({elements:z.array(VisionElementSchema).max(150),warnings:z.array(z.string().max(500)).max(30)});
export type VisionOutput=z.infer<typeof VisionOutputSchema>;

/**
 * Validates an answer element by element. Structured output enforces the JSON shape but not every
 * refinement (distinct polygon points, positive box sizes), and clamping to the drawing can
 * degenerate a shape; such elements are discarded and reported instead of failing the floor.
 * Blank labels are removed because the element schema requires a non-empty label.
 */
export function cleanVisionOutput(value: unknown): VisionOutput | undefined {
  const loose=z.object({elements:z.array(z.unknown()),warnings:z.array(z.unknown()).optional()}).safeParse(value);
  if(!loose.success) return undefined;
  const elements=loose.data.elements.flatMap(element=>{
    const parsed=VisionElementSchema.safeParse(element);
    if(!parsed.success) return [];
    const {label,...rest}=parsed.data;
    return [label?.trim()?{...rest,label:label.trim()}:rest];
  }).slice(0,150);
  const warnings=(loose.data.warnings??[]).filter((w):w is string=>typeof w==='string').map(w=>w.slice(0,500));
  const dropped=loose.data.elements.length-elements.length;
  if(dropped) warnings.unshift(`${dropped} malformed element(s) were discarded.`);
  return {elements,warnings:warnings.slice(0,30)};
}
export interface VisionRunner {
  model: string;
  /** Changes whenever the runner's instructions change, so cached extractions are not reused. */
  version?: string;
  run(image: Uint8Array, width:number,height:number): Promise<{output:unknown;inputTokens:number;outputTokens:number;estimatedCostUsd?:number}>;
}
