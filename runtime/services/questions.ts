import type { AnalysisSession, ArchitecturalElement, ComplianceRule, Condition, GeometryReport, Measurement, ReviewAnswer, ReviewQuestion, RuleEvaluation } from '../../src/domain';
import { ReviewQuestionSchema } from '../../src/domain';
import type { RuntimeContext } from '../context';
import { findSession, findSessionLocation, findFloor, floorView } from '../db/repo';
import { ApiFailure, notFound, revisionConflict } from '../http/errors';
import { getProject, updateProject } from './projects';
import { updateDrawingGeometry } from './geometry';
import { confirmElements } from './elements';
import { correctElementMeasurement } from './measurements';
import { stableId } from './assumptions';

function subtypes(c:Condition):string[] {
  if(c.op==='ALL'||c.op==='ANY')return c.children.flatMap(subtypes);
  return 'field' in c&&c.field==='element.subtype'&&'value' in c?(Array.isArray(c.value)?c.value:typeof c.value==='string'?[c.value]:[]):[];
}

export function questionCandidates(evaluations:RuleEvaluation[],elements:ArchitecturalElement[],rules:ComplianceRule[],report?:GeometryReport,measurements:Measurement[]=[]):ReviewQuestion[] {
  const questions=new Map<string,ReviewQuestion>();
  const add=(key:string,kind:ReviewQuestion['kind'],title:string,ruleIds:string[],candidateIds:string[],extra:Partial<ReviewQuestion>={})=>{
    const previous=questions.get(key);
    questions.set(key,{id:stableId(key),key,kind,title,ruleIds:[...new Set([...(previous?.ruleIds??[]),...ruleIds])],candidateIds:[...new Set([...(previous?.candidateIds??[]),...candidateIds])],automatic:false,status:'PENDING',...extra});
  };
  const blocked=evaluations.filter(e=>e.status==='UNKNOWN'&&!e.preliminary);
  const physicalRules=rules.filter(r=>r.requiredInputs.includes('CLEAR_WIDTH_M')&&['DOOR','ENTRANCE','EXIT','CORRIDOR','STAIR','RAMP'].includes(r.elementType));
  const needsDimensions=physicalRules.some(r=>elements.some(el=>el.type===r.elementType&&!measurements.some(m=>m.elementId===el.id&&m.metric==='CLEAR_WIDTH_M'&&m.unit==='m')));
  if(report && needsDimensions && !report.settings.unit && report.annotations.some(a=>['DIMENSION','NOMINAL_OPENING'].includes(a.kind)))add('unit','UNIT','Which unit do the drawing dimensions use?',physicalRules.map(r=>r.id),[]);
  else if(report && needsDimensions && !report.metresPerPixel && !report.automaticScale)add('calibration','CALIBRATION','Select two points with a known distance',physicalRules.map(r=>r.id),[]);
  const assumedDoors=elements.filter(e=>e.classificationReason?.startsWith('ASSUMED_INTERNAL:'));
  const entranceRule=rules.find(r=>r.elementType==='DOOR'&&subtypes(r.applicability).includes('ACCESSIBLE_ENTRANCE_DOOR_ART22'));
  if(assumedDoors.length&&entranceRule)add('entrance-doors','CLASSIFICATION','Mark the entrance doors',[entranceRule.id],elements.filter(e=>['DOOR','ENTRANCE','EXIT'].includes(e.type)).map(e=>e.id),{subtype:'ACCESSIBLE_ENTRANCE_DOOR_ART22'});
  for(const e of blocked) {
    const element=elements.find(el=>el.id===e.elementId),rule=rules.find(r=>r.id===e.ruleId);
    if(element?.type==='ROOM'&&!element.subtype)continue;
    for(const field of e.unknownFacts??[]) {
      if(['classification','buildingHeightM','floorCount','occupantCount','characteristic.isNewBuild','characteristic.hasPublicAccess','characteristic.hasAccessibleRoute','characteristic.hasRamp','characteristic.hasExternalStair'].includes(field))add(`project:${field}`,'PROJECT',`Add ${field.replace('characteristic.','').replace(/([A-Z])/g,' $1').toLowerCase()}`,[e.ruleId],[],{field});
    }
    const allowed=rule?subtypes(rule.applicability):[];
    if(element?.subtype && allowed.length && !allowed.includes(element.subtype))continue;
    if(element&&!element.subtype&&rule&&(e.reasonCode==='SUBTYPE_UNCONFIRMED'||e.unknownFacts?.includes('element.subtype'))) {
      const candidates=elements.filter(el=>el.extraction==='AI_SUGGESTED'&&(el.type===rule.elementType||['DOOR','ENTRANCE','EXIT'].includes(rule.elementType)&&['DOOR','ENTRANCE','EXIT'].includes(el.type)));
      for(const subtype of subtypes(rule.applicability))add(`category:${rule.elementType}:${subtype}`,'CLASSIFICATION',`Select ${subtype.toLowerCase().replace(/_/g,' ')} on the plan`,[e.ruleId],candidates.map(el=>el.id),{subtype});
    }
    if(element)for(const metric of [...new Set([...e.missingInputs,...(element.subtype&&rule?rule.requiredInputs:[])])])add(`measure:${element.id}:${metric}`,'MEASUREMENT',`Check ${metric.toLowerCase().replace(/_/g,' ')} for ${element.label??element.type.toLowerCase()}`,[e.ruleId],[element.id],{metric});
  }
  return [...questions.values()].sort((a,b)=>['UNIT','CALIBRATION','PROJECT','CLASSIFICATION','MEASUREMENT'].indexOf(a.kind)-['UNIT','CALIBRATION','PROJECT','CLASSIFICATION','MEASUREMENT'].indexOf(b.kind)||b.ruleIds.length-a.ruleIds.length||a.key.localeCompare(b.key));
}

function round(ctx:RuntimeContext,session:AnalysisSession){
  const location=findSessionLocation(ctx.db,session.id);
  const floor=location&&findFloor(ctx.db,location.drawingId,location.page);
  if(!location||!floor)throw notFound('Drawing');
  const request=ctx.db.prepare('SELECT project_revision FROM geometry_requests WHERE floor_id=?').pluck().get(floor.floor.id) as number|undefined;
  return {location,floor:floor.floor,revision:request&&request<=session.projectRevision?request:1};
}

export function reviewQuestions(ctx:RuntimeContext,session:AnalysisSession,evaluations:RuleEvaluation[],elements:ArchitecturalElement[],rules:ComplianceRule[],report?:GeometryReport,measurements:Measurement[]=[]):ReviewQuestion[] {
  if(session.status==='RUNNING'||session.status==='FAILED'||getProject(ctx.db,session.projectId).revision!==session.projectRevision)return [];
  const r=round(ctx,session);
  const candidates=questionCandidates(evaluations,elements,rules,report,measurements);
  return ctx.db.transaction(()=>{
    const stored=(ctx.db.prepare('SELECT data FROM review_questions WHERE floor_id=? AND round_revision=? ORDER BY rowid').pluck().all(r.floor.id,r.revision) as string[]).map(s=>ReviewQuestionSchema.parse(JSON.parse(s)));
    const dismissed=!!ctx.db.prepare("SELECT dismissed FROM review_rounds WHERE floor_id=? AND round_revision=?").pluck().get(r.floor.id,r.revision);
    let count=stored.filter(q=>q.automatic).length;
    for(const candidate of candidates) {
      if(stored.some(q=>q.key===candidate.key))continue;
      const q={...candidate,automatic:!dismissed&&count<5};if(q.automatic)count++;
      ctx.db.prepare('INSERT INTO review_questions(floor_id,round_revision,question_key,data) VALUES(?,?,?,?)').run(r.floor.id,r.revision,q.key,JSON.stringify(q));stored.push(q);
    }
    const keys=new Set(candidates.map(q=>q.key));
    return stored.map(q=>{
      const current=candidates.find(c=>c.key===q.key);
      return {...q,...(current?{candidateIds:current.candidateIds,ruleIds:current.ruleIds}:{}),status:!keys.has(q.key)&&q.status==='PENDING'?'ANSWERED':q.status};
    });
  })();
}

export async function answerReviewQuestion(ctx:RuntimeContext,sessionId:string,questionId:string,answer:ReviewAnswer){
  const session=findSession(ctx.db,sessionId);if(!session)throw notFound('Analysis');
  const project=getProject(ctx.db,session.projectId);if(project.revision!==answer.baseRevision||session.projectRevision!==answer.baseRevision)throw revisionConflict(project.revision,answer.baseRevision);
  const r=round(ctx,session);
  const stored=(ctx.db.prepare('SELECT data FROM review_questions WHERE floor_id=? AND round_revision=?').pluck().all(r.floor.id,r.revision) as string[]).map(s=>ReviewQuestionSchema.parse(JSON.parse(s)));
  const q=stored.find(q=>q.id===questionId);if(!q)throw notFound('Question');
  const write=(question:ReviewQuestion,status:ReviewQuestion['status'])=>ctx.db.prepare('UPDATE review_questions SET data=? WHERE floor_id=? AND round_revision=? AND question_key=?').run(JSON.stringify({...question,status}),r.floor.id,r.revision,question.key);
  if(answer.action==='DISMISS'){ctx.db.transaction(()=>{ctx.db.prepare('INSERT INTO review_rounds(floor_id,round_revision,dismissed) VALUES(?,?,1) ON CONFLICT(floor_id,round_revision) DO UPDATE SET dismissed=1').run(r.floor.id,r.revision);for(const task of stored)if(task.automatic&&task.status==='PENDING')write(task,'SKIPPED');})();return {projectRevision:project.revision};}
  if(answer.action==='SKIP'){write(q,'SKIPPED');return {projectRevision:project.revision};}
  if(answer.action==='NOT_PRESENT'){if(q.kind!=='CLASSIFICATION')throw new ApiFailure(422,'INVALID_REVIEW_ANSWER','This answer applies only to element identification.');write({...q,resolution:'NOT_PRESENT'},'ANSWERED');return {projectRevision:project.revision};}
  const invalid=()=>new ApiFailure(422,'INVALID_REVIEW_ANSWER','Provide a valid answer for this question.');
  const view=floorView(ctx.db,r.floor.id,project.revision);
  if(q.kind==='UNIT'||q.kind==='CALIBRATION') {
    const {geometryReport}=await import('./geometry');
    const report=geometryReport(ctx.db,r.floor.id,project.revision);if(!report)throw notFound('Geometry');
    if(q.kind==='UNIT'&&!answer.unit||q.kind==='CALIBRATION'&&(!answer.points||!answer.lengthM))throw invalid();
    await updateDrawingGeometry(ctx,r.location.drawingId,r.location.page,{baseRevision:project.revision,...report.settings,...(answer.unit?{unit:answer.unit,unitSource:'USER' as const}:{}),...(answer.points&&answer.lengthM?{calibration:{points:answer.points,lengthM:answer.lengthM}}:{})});
  } else if(q.kind==='CLASSIFICATION') {
    if(!answer.elementIds?.length||!q.subtype||answer.elementIds.some(id=>!q.candidateIds.includes(id)||!view.elements.some(e=>e.id===id)))throw invalid();
    await confirmElements(ctx,project.id,{baseRevision:project.revision,updates:answer.elementIds.map(elementId=>({elementId,subtype:q.subtype}))});
  } else if(q.kind==='MEASUREMENT') {
    const id=q.candidateIds[0];if(!id||!q.metric||typeof answer.value!=='number'||!view.elements.some(e=>e.id===id))throw invalid();
    const {unitForMetric}=await import('../../src/domain');
    await correctElementMeasurement(ctx,id,{baseRevision:project.revision,metric:q.metric,value:answer.value,unit:unitForMetric(q.metric),evidenceIds:[]});
  } else {
    const field=q.field!,value=answer.value;
    if(value===undefined)throw invalid();
    if(field.startsWith('characteristic.')) {
      if(typeof value!=='boolean')throw invalid();
      await updateProject(ctx,project.id,{baseRevision:project.revision,patch:{characteristics:{[field.slice(15)]:value}}});
    } else if(field==='classification') {
      if(typeof value!=='string')throw invalid();
      await updateProject(ctx,project.id,{baseRevision:project.revision,patch:{classification:value}});
    } else {
      if(typeof value!=='number'||(['floorCount','occupantCount'].includes(field)&&!Number.isInteger(value))||field==='floorCount'&&value<1)throw invalid();
      await updateProject(ctx,project.id,{baseRevision:project.revision,patch:{[field]:value}});
    }
  }
  write({...q,...(q.kind==='CLASSIFICATION'?{resolution:'SELECTED' as const}:{})},'ANSWERED');return {projectRevision:getProject(ctx.db,project.id).revision};
}
