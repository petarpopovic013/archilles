import { z } from 'zod';
import type { GeometryReport } from '../domain/geometry';
import type { VisionContext } from './pipeline-types';
import { ElementTypeSchema, MetricSchema } from '../domain/common';
import { GeometrySchema, PointSchema } from '../domain/project';
export const VisionLabelSchema=z.strictObject({
  text:z.string().min(1).max(1000),geometry:GeometrySchema,
  kind:z.enum(['DIMENSION','NOMINAL_OPENING','ROOM_LABEL','OPENING_LABEL','LEVEL','OTHER']).optional(),
  direction:z.enum(['HORIZONTAL','VERTICAL','ROTATED','UNKNOWN']).optional(),
  span:z.array(PointSchema).length(2).optional(),
  association:z.enum(['SUGGESTED','UNRESOLVED']).optional(),
});
export const VisionElementSchema=z.strictObject({
  ref:z.string().min(1).max(80), type:ElementTypeSchema, label:z.string().max(200).optional(), subtype:z.string().max(100).optional(),geometry:GeometrySchema, interiorPoint:PointSchema.optional(), openingKind:z.enum(['DOOR','WINDOW','UNKNOWN']).optional(), openingConflict:z.boolean().optional(),
  labels:z.array(VisionLabelSchema).max(40).optional(),
  measurements:z.array(z.strictObject({metric:MetricSchema,value:z.number().nonnegative().optional(),unit:z.string().max(30).optional(),rawLabel:z.string().max(1000),geometry:GeometrySchema.optional(),confidence:z.number().min(0).max(1),dimensionKind:z.enum(['MEASURED_SPAN','NOMINAL_OPENING','UNCERTAIN']).optional()})),
});
export const VisionOutputSchema=z.strictObject({elements:z.array(VisionElementSchema).max(150),annotations:z.array(VisionLabelSchema).max(1000).optional(),warnings:z.array(z.string().max(500)).max(30)});
export type VisionOutput=z.infer<typeof VisionOutputSchema>;

/**
 * Validates an answer element by element. Structured output enforces the JSON shape but not every
 * refinement (distinct polygon points, positive box sizes), and clamping to the drawing can
 * degenerate a shape; such elements are discarded and reported instead of failing the floor.
 * Blank labels are removed because the element schema requires a non-empty label.
 */
export function cleanVisionOutput(value: unknown): VisionOutput | undefined {
  const loose=z.object({elements:z.array(z.unknown()),annotations:z.array(z.unknown()).optional(),warnings:z.array(z.unknown()).optional()}).safeParse(value);
  if(!loose.success) return undefined;
  const normalizeGeometry=(value:unknown):unknown=>{
    if(!value||typeof value!=='object')return value;
    const g=value as {kind?:unknown;points?:unknown};
    if(g.kind!=='POLYGON'||!Array.isArray(g.points))return value;
    const ps=g.points.filter((p,i,all)=>i===0||JSON.stringify(p)!==JSON.stringify(all[i-1]));
    if(ps.length>1&&JSON.stringify(ps[0])===JSON.stringify(ps[ps.length-1]))ps.pop();
    return {...value,points:ps};
  };
  let discardedLabels=0;
  const elements=loose.data.elements.flatMap(element=>{
    if(!element||typeof element!=='object')return [];
    const raw=element as Record<string,unknown>;
    const located=(items:unknown)=>Array.isArray(items)?items.map(item=>item&&typeof item==='object'&&'geometry' in item?{...item,geometry:normalizeGeometry(item.geometry)}:item):items;
    const normalizedLabels=located(raw.labels);
    const labels=Array.isArray(normalizedLabels)?normalizedLabels.flatMap(l=>{const p=VisionLabelSchema.safeParse(l);if(!p.success){discardedLabels++;return [];}return [p.data];}).slice(0,40):normalizedLabels;
    const parsed=VisionElementSchema.safeParse({...raw,geometry:normalizeGeometry(raw.geometry),...(raw.labels?{labels}:{}),measurements:located(raw.measurements)});
    if(!parsed.success) return [];
    const {label,...rest}=parsed.data;
    return [label?.trim()?{...rest,label:label.trim()}:rest];
  }).slice(0,150);
  const warnings=(loose.data.warnings??[]).filter((w):w is string=>typeof w==='string').map(w=>w.slice(0,500));
  const dropped=loose.data.elements.length-elements.length;
  if(dropped) warnings.unshift(`${dropped} malformed element(s) were discarded.`);
  const annotations=loose.data.annotations?.flatMap(item=>{const parsed=VisionLabelSchema.safeParse(item&&typeof item==='object'&&'geometry' in item?{...item,geometry:normalizeGeometry(item.geometry)}:item);return parsed.success?[parsed.data]:[];}).slice(0,1000);
  discardedLabels+=(loose.data.annotations?.length??0)-(annotations?.length??0);
  if(discardedLabels)warnings.unshift(`${discardedLabels} malformed annotation(s) were discarded.`);
  return {elements,warnings:warnings.slice(0,30),...(annotations?{annotations}:{})};
}
export interface VisionRunner {
  model: string;
  /** Changes whenever the runner's instructions change, so cached extractions are not reused. */
  version?: string;
  pipeline?: boolean;
  run(image: Uint8Array, width:number,height:number,context?:VisionContext): Promise<{output:unknown;inputTokens:number;outputTokens:number;estimatedCostUsd?:number;report?:GeometryReport}>;
}
