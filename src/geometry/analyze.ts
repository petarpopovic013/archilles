import { bounds, centre, contains, intersectionRatio, iou } from './topology';
import {unitForDrawingAnnotation,type DrawingAnnotation} from '../domain/geometry';
import type { VisionContext } from '../vision/pipeline-types';
import { createHash, randomUUID } from 'node:crypto';
import { ArchitecturalElementSchema, EvidenceSchema, MeasurementSchema, geometryFitsFloor, FloorSchema, type Floor } from '../domain/project';
import { VisionOutputSchema, type VisionOutput, type VisionRunner } from '../vision/schema';
import { PROMPT_VERSION } from '../vision/claude';
import { transformGeometry } from './transforms';
import { normalizeValue } from './measurements';
import { dimensionLabelIssue } from './dimension-labels';
import { GeometryError, type ExistingObservations, type GeometryExtraction, type PreparedPage } from './types';
export interface ExtractionCache { get(key:string):Promise<GeometryExtraction|undefined>; set(key:string,value:GeometryExtraction):Promise<void> }
export interface AnalyzeInput {
  page: PreparedPage; floor: Floor; vision: VisionRunner; cache: ExtractionCache;
  /** Atomically reserve the maximum call cost (including one retry); throw when denied. */
  reserveBudget:()=>Promise<void>; readPrivateRaster:(reference:string)=>Promise<Uint8Array>;
  visionContext?: VisionContext;
  existing?: ExistingObservations; at:string;
}
// Scoped to the injected cache; two distinct runtimes cannot accidentally share private results.
const inFlight=new WeakMap<ExtractionCache,Map<string,Promise<GeometryExtraction>>>();
export function extractionCacheKey(input: AnalyzeInput) {
  return createHash('sha256').update(JSON.stringify([input.page.projectId,input.page.drawingId,input.page.revision,input.floor.id,input.page.sha256,input.page.page,input.page.preprocessingVersion,input.vision.model,PROMPT_VERSION,input.vision.version??'',input.page.sourceToRaster,input.visionContext?.settings])).digest('hex');
}
function materialize(output:VisionOutput,input:AnalyzeInput,usage:GeometryExtraction['usage']): GeometryExtraction {
  const {page,floor,at}=input;
  const result:GeometryExtraction={elements:[],measurements:[],evidence:[],missingInputs:[],warnings:[...output.warnings],usage};
  const refs=new Set<string>();
  for(const item of output.elements) {
    if(refs.has(item.ref)) throw new GeometryError('VISION_DUPLICATE_REFERENCE'); refs.add(item.ref);
    const geometry=transformGeometry(page.rasterToSource,item.geometry);
    if(!geometryFitsFloor(geometry,floor)) throw new GeometryError('VISION_GEOMETRY_BOUNDS');
    const evidence=EvidenceSchema.parse({id:randomUUID(),projectId:page.projectId,revision:page.revision,drawingId:page.drawingId,page:page.page,geometry,source:'DRAWING',text:item.label,capturedAt:at});
    const labelEvidence = (item.labels ?? []).map(label => {
      const labelGeometry = transformGeometry(page.rasterToSource, label.geometry);
      if (!geometryFitsFloor(labelGeometry, floor)) throw new GeometryError('VISION_GEOMETRY_BOUNDS');
      return EvidenceSchema.parse({...evidence, id:randomUUID(), text:label.text, geometry:labelGeometry});
    });
    const element=ArchitecturalElementSchema.parse({id:randomUUID(),projectId:page.projectId,floorId:floor.id,revision:page.revision,type:item.type,subtype:item.subtype,classificationReason:item.classificationReason,label:item.label,geometry,relationIds:[],extraction:'AI_SUGGESTED',evidenceIds:[evidence.id,...labelEvidence.map(label=>label.id)]});
    result.elements.push(element); result.evidence.push(evidence,...labelEvidence);
    for(const m of item.measurements) {
      const labelGeometry=m.geometry?transformGeometry(page.rasterToSource,m.geometry):geometry;
      if(!geometryFitsFloor(labelGeometry,floor)) throw new GeometryError('VISION_GEOMETRY_BOUNDS');
      const labelEvidence=EvidenceSchema.parse({...evidence,id:randomUUID(),text:m.rawLabel,geometry:labelGeometry});
      result.evidence.push(labelEvidence);
      element.evidenceIds.push(labelEvidence.id);
      try {
        if(m.value===undefined||!m.unit||!m.rawLabel.trim()) throw new GeometryError('AMBIGUOUS_MEASUREMENT');
        const issue=dimensionLabelIssue({...m,value:m.value,unit:m.unit});
        if(issue){result.missingInputs.push({elementId:element.id,metric:m.metric,reason:issue});continue;}
        const normalized=normalizeValue(m.metric,m.value,m.unit);
        // Route lengths require a validated connectivity graph, outside this extractor.
        if(m.metric==='ROUTE_LENGTH_M') throw new GeometryError('ROUTE_GRAPH_REQUIRED');
        result.measurements.push(MeasurementSchema.parse({id:randomUUID(),projectId:page.projectId,elementId:element.id,revision:page.revision,metric:m.metric,...normalized,originalValue:m.value,originalUnit:m.unit,source:'DRAWING_LABEL',verification:'UNVERIFIED',confidence:m.confidence,evidenceIds:[labelEvidence.id],recordedAt:at}));
        result.missingInputs.push({elementId:element.id,metric:m.metric,reason:'Confirm label, unit and association with the selected element.'});
      } catch { result.missingInputs.push({elementId:element.id,metric:m.metric,reason:'Dimension or unit is uncertain; provide a confirmed measurement.'}); }
    }
    if(!item.measurements.length&&['DOOR','CORRIDOR','ENTRANCE','EXIT'].includes(item.type)) result.missingInputs.push({elementId:element.id,metric:'CLEAR_WIDTH_M',reason:'No explicit clear-width evidence.'});
  }
  for(const label of output.annotations??[]) {
    const geometry=transformGeometry(page.rasterToSource,label.geometry);
    if(geometryFitsFloor(geometry,floor))result.evidence.push(EvidenceSchema.parse({id:randomUUID(),projectId:page.projectId,revision:page.revision,drawingId:page.drawingId,page:page.page,geometry,source:'DRAWING',text:label.text,capturedAt:at}));
  }
  result.missingInputs=Array.from(new Map(result.missingInputs.map(m=>[`${m.elementId}:${m.metric}`,m])).values());
  return result;
}
function mergeExisting(result:GeometryExtraction,input:AnalyzeInput):GeometryExtraction {
  if(!input.existing) return structuredClone(result);
  const existing=input.existing;
  for(const entity of [...existing.elements,...existing.measurements,...existing.evidence]) {
    if(entity.projectId!==input.page.projectId||entity.revision!==input.page.revision) throw new GeometryError('EXISTING_REVISION_MISMATCH');
  }
  existing.elements.forEach(e=>{ArchitecturalElementSchema.parse(e);if(e.floorId!==input.floor.id||!geometryFitsFloor(e.geometry,input.floor)) throw new GeometryError('INVALID_EXISTING_GEOMETRY');});
  existing.measurements.forEach(m=>MeasurementSchema.parse(m));existing.evidence.forEach(e=>EvidenceSchema.parse(e));
  // A confirmed floor is authoritative: retain it rather than introduce duplicate model elements.
  const confirmed=existing.elements.filter(e=>e.extraction!=='AI_SUGGESTED');
  if(!confirmed.length) return structuredClone(result);
  const ids=new Set(confirmed.map(e=>e.id));
  const evidenceIds=new Set(existing.evidence.map(e=>e.id));
  for(const e of confirmed) if(e.evidenceIds.some(id=>!evidenceIds.has(id))) throw new GeometryError('EXISTING_EVIDENCE_MISSING');
  for(const m of existing.measurements) if(!existing.elements.some(e=>e.id===m.elementId)||m.evidenceIds.some(id=>!evidenceIds.has(id))) throw new GeometryError('EXISTING_REFERENCE_INVALID');
  return {...structuredClone(result),elements:confirmed,measurements:existing.measurements.filter(m=>ids.has(m.elementId)),evidence:existing.evidence,missingInputs:existing.measurements.filter(m=>ids.has(m.elementId)&&m.verification==='UNVERIFIED').map(m=>({elementId:m.elementId,metric:m.metric,reason:'Confirm existing measurement evidence.'})),warnings:[...result.warnings,'Confirmed floor observations retained; new AI suggestions were not merged automatically.']};
}
export async function analyzeDrawing(input:AnalyzeInput):Promise<GeometryExtraction> {
  const floor=FloorSchema.parse(input.floor),p=input.page;
  if(floor.projectId!==p.projectId||floor.drawingId!==p.drawingId||floor.page!==p.page||floor.imageWidthPx!==p.sourceWidth||floor.imageHeightPx!==p.sourceHeight) throw new GeometryError('PAGE_FLOOR_MISMATCH');
  const key=extractionCacheKey(input);
  const cached=await input.cache.get(key);
  if(cached) return mergeExisting({...cached,usage:{...cached.usage,cacheHit:true}},input);
  let pending=inFlight.get(input.cache);if(!pending){pending=new Map();inFlight.set(input.cache,pending);}
  let task=pending.get(key);
  if(!task) {
    task=(async()=>{
      await input.reserveBudget();
      const response=await input.vision.run(await input.readPrivateRaster(p.rasterReference),p.rasterWidth,p.rasterHeight,input.visionContext);
      const parsed=VisionOutputSchema.safeParse(response.output);
      const responseUsage={model:input.vision.model,inputTokens:response.inputTokens,outputTokens:response.outputTokens,estimatedCostUsd:response.estimatedCostUsd,cacheHit:false};
      if(!parsed.success) throw new GeometryError('VISION_SCHEMA_INVALID',false,responseUsage);
      let result: GeometryExtraction;
      try { result=materialize(parsed.data,input,responseUsage); result.report=response.report;
        if(result.report) {
          result.report.openings=result.elements.filter(e=>['DOOR','ENTRANCE','EXIT','OPENING'].includes(e.type)).map(e=>{
            const b=e.geometry.kind==='BBOX'?e.geometry:undefined;
            const c=centre(e.geometry),pad=b?Math.max(4,Math.min(b.width,b.height)*1.5):4;
            const points=b?(b.width>b.height?[{x:c.x,y:b.y-pad},{x:c.x,y:b.y+b.height+pad}]:[{x:b.x-pad,y:c.y},{x:b.x+b.width+pad,y:c.y}]):[c];
            const rooms=result.elements.filter(r=>['ROOM','CORRIDOR'].includes(r.type)&&points.some(p=>contains(r.geometry,p)));
            e.relationIds=rooms.map(r=>r.id).slice(0,2);
            const observation=parsed.data.elements.find(o=>iou(transformGeometry(input.page.rasterToSource,o.geometry),e.geometry)>.8);
            return {elementId:e.id,kind:e.type==='OPENING'?observation?.openingKind??'UNKNOWN' as const:'DOOR' as const,geometry:e.geometry,roomIds:e.relationIds};
          });
          result.report.annotations=result.evidence.filter(e=>e.text?.trim()&&e.geometry).slice(0,1000).map(e=>{
            const owner=result.elements.find(el=>el.evidenceIds.includes(e.id))??result.elements.find(el=>contains(el.geometry,centre(e.geometry!)));
            const meta=[...parsed.data.elements.flatMap(item=>item.labels??[]),...(parsed.data.annotations??[])].find(l=>l.text===e.text&&iou(transformGeometry(input.page.rasterToSource,l.geometry),e.geometry!)>.5);
            const span=meta?.span?.map(p=>({x:input.page.rasterToSource[0]*p.x+input.page.rasterToSource[2]*p.y+input.page.rasterToSource[4],y:input.page.rasterToSource[1]*p.x+input.page.rasterToSource[3]*p.y+input.page.rasterToSource[5]}));
            const validSpan=span?.every(p=>p.x>=0&&p.y>=0&&p.x<=floor.imageWidthPx&&p.y<=floor.imageHeightPx)?span:undefined;
            const text=e.text!,pair=/\d+\s*(?:[/×x]|\n)\s*\d+/.test(text);
            const kind:DrawingAnnotation['kind']=pair?'NOMINAL_OPENING':/^[-+]?\d+[.,]?\d*\s*(?:m|cm|mm)?$/.test(text)?(['ROOM','CORRIDOR'].includes(owner?.type??'')&&/^\d+[a-z]?$/.test(text)?'ROOM_LABEL':'DIMENSION'):/^[VPВП]\d+/i.test(text)?'OPENING_LABEL':'OTHER';
            const effectiveKind=meta?.kind??kind,unit=unitForDrawingAnnotation(text,['DIMENSION','NOMINAL_OPENING'].includes(effectiveKind)?result.report!.settings.unit:null);
            return {id:e.id,elementId:owner?.id,text,geometry:e.geometry!,kind:effectiveKind,direction:meta?.direction??'UNKNOWN' as const,...(validSpan?{span:validSpan}:{}),association:meta?.association??(kind==='DIMENSION'?'UNRESOLVED':'SUGGESTED') as DrawingAnnotation['association'],...(unit?{unit}:{})};
          });
          for(const issue of result.report.issues)if(issue.geometry) { const direct=result.elements.filter(e=>iou(e.geometry,issue.geometry!)>.5); issue.elementIds=(direct.length?direct:result.elements.filter(e=>intersectionRatio(e.geometry,issue.code==='WALL_GAP_REVIEW'?{kind:'BBOX',x:bounds(issue.geometry!).x-3,y:bounds(issue.geometry!).y-3,width:bounds(issue.geometry!).width+6,height:bounds(issue.geometry!).height+6}:issue.geometry!)>0)).map(e=>e.id); }
        } } catch(error) {
        if(error instanceof GeometryError) throw new GeometryError(error.code,error.retryable,responseUsage);
        throw new GeometryError('VISION_SCHEMA_INVALID',false,responseUsage);
      }
      await input.cache.set(key,structuredClone(result)); return result;
    })();
    pending.set(key,task);
  }
  try { return mergeExisting(await task,input); } finally { pending.delete(key); }
}
