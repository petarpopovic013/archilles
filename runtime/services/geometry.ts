import { randomUUID } from 'node:crypto';
import { DEFAULT_DRAWING_SETTINGS, unitForDrawingAnnotation, DrawingSettingsSchema, GeometryReportSchema, type DrawingSettings, type GeometryReport, type GeometrySetupRequestSchema, type GeometryPageRequestSchema } from '../../src/domain';
import type { z } from 'zod';
import type { RuntimeContext } from '../context';
import { findDrawing, findFloor, findFloorById, floorView } from '../db/repo';
import { ApiFailure, notFound, revisionConflict } from '../http/errors';
import { advanceRevision, getProject } from './projects';
import { startAnalysis } from './analyses';
import {area,bounds,centre,contains,intersectionRatio} from '../../src/geometry/topology';
import type { Db } from '../db/connection';

export function drawingSettings(db:Db,floorId:string,revision:number):DrawingSettings {
  const data=db.prepare('SELECT data FROM drawing_settings WHERE floor_id=? AND project_revision<=? ORDER BY project_revision DESC LIMIT 1').pluck().get(floorId,revision);
  return data?DrawingSettingsSchema.parse(JSON.parse(data as string)):structuredClone(DEFAULT_DRAWING_SETTINGS);
}
export function geometryReport(db:Db,floorId:string,revision:number):GeometryReport|undefined {
  const data=db.prepare('SELECT data FROM geometry_reports WHERE floor_id=? AND project_revision<=? ORDER BY project_revision DESC LIMIT 1').pluck().get(floorId,revision);
  if(!data)return undefined;
  const report=GeometryReportSchema.parse(JSON.parse(data as string));
  const settings=drawingSettings(db,floorId,revision);
  const calibration=settings.calibration;
  const metresPerPixel=calibration?calibration.lengthM/Math.hypot(calibration.points[0].x-calibration.points[1].x,calibration.points[0].y-calibration.points[1].y):undefined;
  if(report.stage!=='AWAITING_CONFIRMATION') {
    const current=floorView(db,floorId,revision).elements,elements=new Map(current.map(e=>[e.id,e]));
    report.issues=report.issues.filter(issue=>{
      if(issue.elementIds.length&&issue.elementIds.every(id=>!elements.has(id)))return false;
      const affected=issue.elementIds.flatMap(id=>{const e=elements.get(id);return e?[e]:[];});
      if(issue.code==='SYMBOL_AMBIGUOUS')return !affected.length||!affected.every(e=>e.extraction!=='AI_SUGGESTED'&&e.type!=='UNKNOWN');
      if(issue.code==='ROOM_OVERLAP')return false; // Recomputed from the current boundaries below.
      if(issue.code.startsWith('OPENING_')&&affected.some(e=>e.type==='UNKNOWN'))return true;
      return !affected.length||!affected.every(e=>e.geometryVerification==='USER_CONFIRMED');
    });
    const rooms=current.filter(e=>['ROOM','CORRIDOR'].includes(e.type));
    for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
      const a=rooms[i],b=rooms[j];if(intersectionRatio(a.geometry,b.geometry)>Math.min(area(a.geometry),area(b.geometry))*.025)report.issues.push({code:'ROOM_OVERLAP',message:'Suggested spaces overlap; confirm or correct their boundary.',elementIds:[a.id,b.id],geometry:a.geometry});
    }
    report.openings=current.filter(e=>['DOOR','ENTRANCE','EXIT','OPENING'].includes(e.type)).map(e=>{
      const b=bounds(e.geometry),c=centre(e.geometry),pad=Math.max(4,Math.min(b.width,b.height)*1.5),old=report.openings.find(o=>o.elementId===e.id);
      const probes=b.width>b.height?[{x:c.x,y:b.y-pad},{x:c.x,y:b.y+b.height+pad}]:[{x:b.x-pad,y:c.y},{x:b.x+b.width+pad,y:c.y}];
      return {elementId:e.id,geometry:e.geometry,kind:e.type==='OPENING'?(old?.kind==='WINDOW'?'WINDOW' as const:'UNKNOWN' as const):'DOOR' as const,roomIds:rooms.filter(r=>probes.some(p=>contains(r.geometry,p))).map(r=>r.id).slice(0,2)};
    });
    report.issues=report.issues.slice(0,300);
    if(report.issues.length)report.stage='PARTIAL';else if(report.stage==='PARTIAL'&&report.regions.every(r=>r.processed))report.stage='COMPLETE';
  }
  report.annotations=report.annotations.map(annotation=>({...annotation,unit:unitForDrawingAnnotation(annotation.text,['DIMENSION','NOMINAL_OPENING'].includes(annotation.kind)?settings.unit:null)}));
  return {...report,settings,metresPerPixel};
}
export function saveGeometryReport(ctx:RuntimeContext,floorId:string,revision:number,report:GeometryReport):void {
  const valid=GeometryReportSchema.parse(report);
  ctx.db.prepare('INSERT INTO geometry_reports(floor_id,project_revision,data,created_at) VALUES(?,?,?,?) ON CONFLICT(floor_id,project_revision) DO UPDATE SET data=excluded.data').run(floorId,revision,JSON.stringify(valid),ctx.now());
}
export async function updateDrawingGeometry(ctx:RuntimeContext,drawingId:string,page:number,request:z.output<typeof GeometrySetupRequestSchema>|z.output<typeof GeometryPageRequestSchema>,refresh=false){
  const drawing=findDrawing(ctx.db,drawingId),floor=findFloor(ctx.db,drawingId,page);
  if(!drawing||!floor)throw notFound('Drawing page');
  const project=getProject(ctx.db,drawing.projectId);
  if(project.revision!==request.baseRevision)throw revisionConflict(project.revision,request.baseRevision);
  const previous=geometryReport(ctx.db,floor.floor.id,project.revision);
  if(refresh&&ctx.db.prepare("SELECT 1 FROM sessions WHERE project_id=? AND status='RUNNING'").get(project.id))throw new ApiFailure(409,'GEOMETRY_BUSY','Wait for the running analysis before reading again.');
  let settings=drawingSettings(ctx.db,floor.floor.id,project.revision);
  if('unit' in request){
    const {baseRevision:_,...value}=request; void _; settings=DrawingSettingsSchema.parse(value);
    const ids=new Set(previous?.legend.map(l=>l.id)??[]);
    if(settings.confirmedLegendIds.some(id=>!ids.has(id)))throw new ApiFailure(422,'INVALID_LEGEND','Confirm only symbols present in this drawing.');
    if(settings.calibration){
      const [a,b]=settings.calibration.points;
      if(settings.calibration.points.some(p=>p.x<0||p.y<0||p.x>floor.floor.imageWidthPx||p.y>floor.floor.imageHeightPx)||Math.hypot(a.x-b.x,a.y-b.y)<2)throw new ApiFailure(422,'INVALID_CALIBRATION','Select two distinct points inside the drawing.');
    }
  }
  const {revision}=ctx.db.transaction(()=>{
    const result=advanceRevision(ctx,getProject(ctx.db,project.id),request.baseRevision,'GEOMETRY_CORRECTION',[floor.floor.id]);
    ctx.db.prepare('INSERT INTO drawing_settings(floor_id,project_revision,data) VALUES(?,?,?)').run(floor.floor.id,result.revision.revision,JSON.stringify(settings));
    if(settings.calibration){const [a,b]=settings.calibration.points,id=randomUUID();
      ctx.db.prepare('INSERT INTO evidence(id,project_id,revision,data) VALUES(?,?,?,?)').run(id,project.id,result.revision.revision,JSON.stringify({id,projectId:project.id,revision:result.revision.revision,drawingId,page,geometry:{kind:'POLYLINE',points:[a,b]},source:'USER',text:`User confirmed calibration span ${settings.calibration.lengthM} m.`,capturedAt:ctx.now()}));
    }
    if(refresh){
      ctx.db.prepare("DELETE FROM geometry_stage_cache WHERE floor_id=?").run(floor.floor.id);
      // Preserve confirmed versions; retire only suggestions, never mutate historical observations.
      ctx.db.prepare(`UPDATE elements SET retired_revision=? WHERE floor_id=? AND retired_revision IS NULL AND COALESCE((SELECT json_extract(v.data,'$.extraction') FROM element_versions v WHERE v.element_id=elements.id ORDER BY revision DESC LIMIT 1),json_extract(data,'$.extraction'))='AI_SUGGESTED'`).run(result.revision.revision,floor.floor.id);
      ctx.db.prepare('INSERT INTO geometry_requests(floor_id,project_revision) VALUES(?,?) ON CONFLICT(floor_id) DO UPDATE SET project_revision=excluded.project_revision').run(floor.floor.id,result.revision.revision);
    }
    return result;
  })();
  const started=await startAnalysis(ctx,project.id,{projectRevision:revision.revision,drawingId,page});
  return {projectRevision:revision.revision,sessionId:started.sessionId};
}

export function floorRecord(ctx:RuntimeContext,floorId:string){const record=findFloorById(ctx.db,floorId);if(!record)throw notFound('Floor');return record;}
