import { z } from "zod";
import { GeometrySchema, PointSchema } from "./project";
import { IdSchema, PositiveIntegerSchema, UtcDateTimeSchema } from "./common";

export const DrawingUnitSchema = z.enum(["m", "cm", "mm"]);
export const GeometryStageSchema = z.enum(["OVERVIEW", "AWAITING_CONFIRMATION", "DETAILS", "RECONSTRUCTION", "VALIDATION", "COMPLETE", "PARTIAL"]);
export const LegendItemSchema = z.strictObject({
  id: z.string().min(1).max(80), kind: z.enum(["WALL", "DOOR", "WINDOW", "DIMENSION", "LABEL", "FURNITURE", "OTHER"]),
  description: z.string().min(1).max(500), geometry: GeometrySchema,
  uncertain: z.boolean(), confirmed: z.boolean().optional(),
});
export const DrawingAnnotationSchema = z.strictObject({
  id: z.string().min(1).max(100), elementId: IdSchema.optional(), text: z.string().min(1).max(1000), geometry: GeometrySchema,
  kind: z.enum(["DIMENSION", "NOMINAL_OPENING", "ROOM_LABEL", "OPENING_LABEL", "LEVEL", "OTHER"]),
  direction: z.enum(["HORIZONTAL", "VERTICAL", "ROTATED", "UNKNOWN"]),
  span: z.array(PointSchema).length(2).optional(), unit: DrawingUnitSchema.optional(),
  association: z.enum(["SUGGESTED", "UNRESOLVED", "USER_CONFIRMED"]),
});
export const GeometryIssueSchema = z.strictObject({
  code: z.string().min(1).max(80), message: z.string().min(1).max(1000),
  elementIds: z.array(IdSchema).max(150), geometry: GeometrySchema.optional(),
});
export const DrawingSettingsSchema = z.strictObject({
  unit: DrawingUnitSchema.nullable(), legendConfirmed: z.boolean(), confirmedLegendIds: z.array(z.string().min(1).max(80)).max(40),
  conventionsSource: z.enum(["AI", "USER"]).optional(),
  unitSource: z.enum(["DRAWING", "USER"]).optional(),
  calibration: z.strictObject({ points: z.array(PointSchema).length(2), lengthM: z.number().positive().finite() }).optional(),
});
export const GeometryReportSchema = z.strictObject({
  metresPerPixel: z.number().positive().finite().optional(),
  automaticScale: z.strictObject({ metresPerPixel: z.number().positive().finite(), annotationId: z.string(), }).optional(),
  sourceWidth: PositiveIntegerSchema, sourceHeight: PositiveIntegerSchema,
  version: z.string().min(1), stage: GeometryStageSchema, settings: DrawingSettingsSchema,
  legend: z.array(LegendItemSchema).max(40), annotations: z.array(DrawingAnnotationSchema).max(1000),
  issues: z.array(GeometryIssueSchema).max(300), warnings: z.array(z.string().max(1000)).max(100),
  regions: z.array(z.strictObject({ id: z.string(), geometry: GeometrySchema, processed: z.boolean() })).max(8),
  openings: z.array(z.strictObject({ elementId: IdSchema, kind: z.enum(["DOOR", "WINDOW", "UNKNOWN"]), roomIds: z.array(IdSchema).max(2), geometry: GeometrySchema })).max(150),
  logicalCalls: z.number().int().nonnegative().optional(),
  calls: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(), controllerCostUsd: z.number().nonnegative().optional(),
});
export const GeometrySetupRequestSchema = DrawingSettingsSchema.extend({ baseRevision: PositiveIntegerSchema });
export const GeometryPageRequestSchema = z.strictObject({ baseRevision: PositiveIntegerSchema });
export const GeometryPageResponseSchema = z.strictObject({ projectRevision: PositiveIntegerSchema, sessionId: IdSchema.optional() });
export const StoredGeometryReportSchema = z.strictObject({ floorId: IdSchema, projectRevision: PositiveIntegerSchema, report: GeometryReportSchema, createdAt: UtcDateTimeSchema });
export type GeometryReport = z.infer<typeof GeometryReportSchema>;
export type DrawingSettings = z.infer<typeof DrawingSettingsSchema>;
export type GeometryIssue = z.infer<typeof GeometryIssueSchema>;
export type DrawingAnnotation = z.infer<typeof DrawingAnnotationSchema>;
export const DEFAULT_DRAWING_SETTINGS: DrawingSettings = { unit: null, legendConfirmed: false, confirmedLegendIds: [] };

/** Literal units take precedence over the drawing default; mixed units remain unresolved. */
export function unitForDrawingAnnotation(text:string,defaultUnit?:DrawingSettings['unit']) {
  const explicit=[...new Set([...text.matchAll(/(?:^|[^a-z])(mm|cm|m)\b/gi)].map(m=>m[1].toLowerCase() as z.infer<typeof DrawingUnitSchema>))];
  return explicit.length>1?undefined:explicit[0]??defaultUnit??undefined;
}
