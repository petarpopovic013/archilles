import { randomUUID } from 'node:crypto';
import { unitForMetric, type Metric } from '../domain/common';
import { EvidenceSchema, FloorSchema, MeasurementSchema, type Floor, type Measurement, type Point } from '../domain/project';
import { GeometryError } from './types';
export function normalizeValue(metric: Metric, value: number, unit: string) {
  const expected=unitForMetric(metric);
  const factor=expected==='m'?({m:1,cm:0.01,mm:0.001} as Record<string,number>)[unit]:expected==='ratio'?({ratio:1,'%':0.01} as Record<string,number>)[unit]:unit==='count'?1:undefined;
  if(factor===undefined||!Number.isFinite(value)||value<0 || (expected==='count'&&!Number.isInteger(value))) throw new GeometryError('AMBIGUOUS_MEASUREMENT');
  return {value:value*factor,unit:expected};
}
export function calibratedDistance(a: Point,b: Point,floor: Floor): number {
  floor=FloorSchema.parse(floor);
  if(!floor.calibration) throw new GeometryError('SCALE_REQUIRED');
  if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||[a,b].some(p=>p.x<0||p.y<0||p.x>floor.imageWidthPx||p.y>floor.imageHeightPx)) throw new GeometryError('INVALID_COORDINATES');
  return Math.hypot(a.x-b.x,a.y-b.y)*floor.calibration.metresPerPixel;
}
export function correctMeasurement(input: {previous: Measurement; baseRevision: number; value: number; unit: string; actor: string; at: string; evidenceText: string}) {
  const previous=MeasurementSchema.parse(input.previous);
  if(input.baseRevision<previous.revision||!input.actor.trim()||!input.evidenceText.trim()) throw new GeometryError('INVALID_CORRECTION');
  const revision=input.baseRevision+1;
  const evidence=EvidenceSchema.parse({id:randomUUID(),projectId:previous.projectId,revision,source:'USER',text:input.evidenceText,capturedAt:input.at});
  const measurement=MeasurementSchema.parse({...previous,id:randomUUID(),revision,...normalizeValue(previous.metric,input.value,input.unit),originalValue:input.value,originalUnit:input.unit,source:'USER_CORRECTED',verification:'USER_CONFIRMED',supersedesId:previous.id,recordedBy:input.actor,recordedAt:input.at,evidenceIds:[evidence.id]});
  return {measurement,evidence};
}
