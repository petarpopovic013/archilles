import { z } from "zod";
import {
  AnalysisStatusSchema,
  CharacteristicKeySchema,
  ElementTypeSchema,
  FiniteNumberSchema,
  IdSchema,
  JurisdictionSchema,
  MeasurementSourceSchema,
  MeasurementUnitSchema,
  MetricSchema,
  NonNegativeIntegerSchema,
  NonNegativeNumberSchema,
  PositiveIntegerSchema,
  PositiveNumberSchema,
  ProjectPhaseSchema,
  UtcDateTimeSchema,
  VerificationSchema,
  unitForMetric,
} from "./common";

export const ProjectSchema = z.strictObject({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  jurisdiction: JurisdictionSchema,
  municipality: z.string().trim().min(1).max(120).optional(),
  purpose: z.enum(["OFFICE", "OTHER"]),
  classification: z.string().trim().min(1).max(120).optional(),
  phase: ProjectPhaseSchema,
  buildingHeightM: NonNegativeNumberSchema.optional(),
  floorCount: PositiveIntegerSchema.optional(),
  occupantCount: NonNegativeIntegerSchema.optional(),
  characteristics: z.partialRecord(CharacteristicKeySchema, z.boolean()),
  revision: PositiveIntegerSchema,
  analysisStatus: AnalysisStatusSchema,
  createdAt: UtcDateTimeSchema,
  updatedAt: UtcDateTimeSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export const DrawingMimeTypeSchema = z.enum(["application/pdf", "image/png", "image/jpeg"]);
export const DrawingSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  revision: PositiveIntegerSchema,
  originalName: z.string().trim().min(1).max(255),
  mimeType: DrawingMimeTypeSchema,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageKey: z.string().trim().min(1).max(255),
  byteSize: PositiveIntegerSchema,
  pageCount: PositiveIntegerSchema,
  selectedPage: PositiveIntegerSchema,
  uploadedAt: UtcDateTimeSchema,
}).refine((drawing) => drawing.selectedPage <= drawing.pageCount, {
  message: "Selected page exceeds page count",
  path: ["selectedPage"],
});
export type Drawing = z.infer<typeof DrawingSchema>;

export const PointSchema = z.strictObject({ x: FiniteNumberSchema, y: FiniteNumberSchema });
export const BoundingBoxSchema = z.strictObject({
  kind: z.literal("BBOX"), x: FiniteNumberSchema, y: FiniteNumberSchema,
  width: PositiveNumberSchema, height: PositiveNumberSchema,
});
export const PolygonSchema = z.strictObject({
  kind: z.literal("POLYGON"), points: z.array(PointSchema).min(3),
}).refine((value) => value.points.length <= 400 && new Set(value.points.map((point) => `${point.x},${point.y}`)).size >= 3, {
  message: "Polygon needs three distinct points and at most 400 vertices",
  path: ["points"],
});
export const PolylineSchema = z.strictObject({
  kind: z.literal("POLYLINE"), points: z.array(PointSchema).min(2),
}).refine(value=>value.points.length<=400,{message:"Polyline supports at most 400 vertices",path:["points"]});
export const GeometrySchema = z.union([BoundingBoxSchema, PolygonSchema, PolylineSchema]);
export type Point = z.infer<typeof PointSchema>;
export type Geometry = z.infer<typeof GeometrySchema>;

export const FloorSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  drawingId: IdSchema,
  page: PositiveIntegerSchema,
  levelLabel: z.string().trim().min(1).max(80),
  imageWidthPx: PositiveIntegerSchema,
  imageHeightPx: PositiveIntegerSchema,
  calibration: z.strictObject({
    metresPerPixel: PositiveNumberSchema,
    method: z.enum(["USER_TWO_POINT", "VERIFIED_LABEL"]),
    evidenceId: IdSchema,
    confirmedBy: z.string().trim().min(1),
    confirmedAt: UtcDateTimeSchema,
  }).optional(),
});
export type Floor = z.infer<typeof FloorSchema>;

export const ArchitecturalElementSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  floorId: IdSchema,
  revision: PositiveIntegerSchema,
  type: ElementTypeSchema,
  subtype: z.string().trim().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  geometry: GeometrySchema,
  geometryVerification: VerificationSchema.optional(),
  relationIds: z.array(IdSchema),
  extraction: z.enum(["AI_SUGGESTED", "USER_CONFIRMED", "USER_CREATED"]),
  evidenceIds: z.array(IdSchema),
});
export type ArchitecturalElement = z.infer<typeof ArchitecturalElementSchema>;

export const EvidenceSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  revision: PositiveIntegerSchema,
  drawingId: IdSchema.optional(),
  page: PositiveIntegerSchema.optional(),
  geometry: GeometrySchema.optional(),
  text: z.string().max(4000).optional(),
  source: z.enum(["DRAWING", "USER", "REGULATION"]),
  capturedAt: UtcDateTimeSchema,
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const MeasurementSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  elementId: IdSchema,
  revision: PositiveIntegerSchema,
  metric: MetricSchema,
  value: NonNegativeNumberSchema,
  unit: MeasurementUnitSchema,
  originalValue: FiniteNumberSchema.optional(),
  originalUnit: z.string().trim().min(1).max(30).optional(),
  source: MeasurementSourceSchema,
  verification: VerificationSchema,
  confidence: z.number().min(0).max(1).optional(),
  evidenceIds: z.array(IdSchema),
  supersedesId: IdSchema.optional(),
  recordedBy: z.string().trim().min(1).optional(),
  recordedAt: UtcDateTimeSchema,
}).superRefine((measurement, context) => {
  if (measurement.source === "AI_ESTIMATE" && measurement.verification !== "UNVERIFIED") {
    context.addIssue({ code: "custom", path: ["verification"], message: "AI estimates require separate human verification" });
  }
  const expectedUnit = unitForMetric(measurement.metric);
  if (measurement.unit !== expectedUnit) {
    context.addIssue({ code: "custom", path: ["unit"], message: `Expected ${expectedUnit} for ${measurement.metric}` });
  }
});
export type Measurement = z.infer<typeof MeasurementSchema>;

/** Cross-entity check for geometry bounds; use after loading the owning Floor. */
export function geometryFitsFloor(geometry: Geometry, floor: Floor): boolean {
  const points = geometry.kind === "BBOX"
    ? [{ x: geometry.x, y: geometry.y }, { x: geometry.x + geometry.width, y: geometry.y + geometry.height }]
    : geometry.points;
  return points.every(({ x, y }) => x >= 0 && y >= 0 && x <= floor.imageWidthPx && y <= floor.imageHeightPx);
}
