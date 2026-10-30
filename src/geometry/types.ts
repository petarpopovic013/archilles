import type { ArchitecturalElement, Drawing, Evidence, Floor, Measurement } from '../domain/project';
import type { Metric } from '../domain/common';
import type { Affine } from './transforms';
export class GeometryError extends Error {
  constructor(public readonly code: string, public readonly retryable = false, public readonly usage?: GeometryExtraction['usage']) { super(code); }
}
export interface PreparedPage {
  projectId: string; drawingId: string; revision: number; page: number; sha256: string;
  sourceWidth: number; sourceHeight: number; rasterWidth: number; rasterHeight: number;
  rasterReference: string; sourceToRaster: Affine; rasterToSource: Affine;
  rotation: number; dpi?: number; cropBox?: readonly number[]; preprocessingVersion: string;
}
export interface PageRenderer {
  /** Inspect metadata without allocating the decoded image. Must reject encrypted/corrupt PDFs. */
  inspect(bytes: Uint8Array, mime: Drawing['mimeType'], page: number): Promise<{
    pageCount: number; width: number; height: number; rotation: number; cropBox?: readonly number[];
  }>;
  /** Decode selected page only, normalize EXIF, and produce a PNG at the requested size. */
  render(bytes: Uint8Array, mime: Drawing['mimeType'], page: number, width: number, height: number): Promise<Uint8Array>;
}
export interface MissingInput { elementId: string; metric: Metric; reason: string }
export interface GeometryExtraction {
  elements: ArchitecturalElement[]; measurements: Measurement[]; evidence: Evidence[];
  missingInputs: MissingInput[]; warnings: string[];
  usage: { model: string; inputTokens: number; outputTokens: number; estimatedCostUsd?: number; cacheHit: boolean };
}
export interface ExistingObservations { elements: ArchitecturalElement[]; measurements: Measurement[]; evidence: Evidence[] }
export type GeometryFloor = Floor;
