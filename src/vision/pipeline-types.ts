import type { DrawingSettings, GeometryReport } from '../domain/geometry';
import type { Geometry } from '../domain/project';
export interface SourceRegion { id: string; geometry: Extract<Geometry,{kind:'BBOX'}>; image: Uint8Array; width:number; height:number }
export interface VisionContext {
  settings: DrawingSettings;
  priorUsage?: {logicalCalls?:number;calls:number;inputTokens:number;outputTokens:number;estimatedCostUsd:number};
  sourceWidth:number; sourceHeight:number;
  readRegion(box: Extract<Geometry,{kind:'BBOX'}>): Promise<SourceRegion>;
  text?: Array<{text:string;geometry:Geometry}>;
  cache: {get(key:string):Promise<unknown>;set(key:string,value:unknown):Promise<void>};
  current(): boolean;
  onStage(stage:GeometryReport['stage'], calls:number, regionCount:number): void;
}
