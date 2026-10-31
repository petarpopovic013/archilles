import {FindingsAssessmentSchema,type FindingsAssessment} from '../domain/assessment';
import type {ArchitecturalElement,ComplianceFinding,ReviewQuestion,RuleEvaluation,AnalysisStatus} from '../domain';

/** Presentation groups do not change an engine result or silently count an unperformed check. */
export function assessFindings(input:{status:AnalysisStatus;findings:ComplianceFinding[];evaluations:RuleEvaluation[];elements:ArchitecturalElement[];questions:ReviewQuestion[]}):FindingsAssessment {
  const {findings,evaluations,elements,questions}=input;
  const assessment:FindingsAssessment={phase:'EMPTY',results:[],unresolved:[],excluded:[]};
  if(input.status==='RUNNING'){assessment.phase='ANALYSING';return assessment;}
  const setup=questions.find(q=>['UNIT','CALIBRATION'].includes(q.kind)&&q.status!=='ANSWERED');
  if(setup)assessment.setupQuestionId=setup.id;
  const titles={PROJECT:'Project context',CLASSIFICATION:'Identify the relevant elements',MEASUREMENT:'Complete the remaining dimensions',INTERPRETATION:'Resolve a source interpretation',OTHER:'Complete the review'};
  for(const finding of findings){
    const evaluation=evaluations.find(e=>e.id===finding.evaluationId);
    const status=finding.preliminary?.status??finding.status;
    if(finding.stale){assessment.excluded.push({findingId:finding.id,reason:'Earlier project revision'});continue;}
    if(status==='NOT_APPLICABLE'){assessment.excluded.push({findingId:finding.id,reason:'Outside the applicable checks'});continue;}
    if(status==='PASS'||status==='FAIL'){assessment.results.push({findingId:finding.id,status:status==='PASS'?'GOOD':'FAIL',estimated:!!finding.preliminary});continue;}
    if(!finding.elementId&&(!evaluation||evaluation.unknownFacts?.includes('element.type')||evaluation.reasonCode==='NO_MATCHING_ELEMENTS')){
      assessment.excluded.push({findingId:finding.id,reason:'Relevant element not identified on this page'});continue;
    }
    const element=elements.find(e=>e.id===finding.elementId);
    const absent=questions.some(q=>q.resolution==='NOT_PRESENT'&&q.ruleIds.includes(finding.ruleId)&&(!finding.elementId||q.candidateIds.includes(finding.elementId)));
    if(absent){assessment.excluded.push({findingId:finding.id,reason:'This element role was marked absent from the plan'});continue;}
    if(element?.type==='ROOM'&&!element.subtype&&evaluation?.unknownFacts?.includes('element.subtype')){
      assessment.excluded.push({findingId:finding.id,reason:'Special-purpose room designation not established on this page'});continue;
    }

    if(!element&&evaluation?.reasonCode==='ELEMENT_REQUIRED'){assessment.excluded.push({findingId:finding.id,reason:'No supported target on this page'});continue;}
    const related=questions.filter(q=>q.ruleIds.includes(finding.ruleId)&&(!q.candidateIds.length||!finding.elementId||q.candidateIds.includes(finding.elementId))&&q.status!=='ANSWERED');
    const facts=evaluation?.unknownFacts??[];
    const key:FindingsAssessment['unresolved'][number]['key']=facts.some(f=>!f.startsWith('element.'))?'PROJECT':facts.includes('element.subtype')||evaluation?.reasonCode==='SUBTYPE_UNCONFIRMED'?'CLASSIFICATION':evaluation?.missingInputs.length?'MEASUREMENT':status==='NEEDS_REVIEW'?'INTERPRETATION':'OTHER';
    let group=assessment.unresolved.find(g=>g.key===key);
    if(!group){group={key,title:titles[key],findingIds:[],questionIds:[]};assessment.unresolved.push(group);}
    group.findingIds.push(finding.id);group.questionIds=[...new Set([...group.questionIds,...related.map(q=>q.id)])];
  }
  const entrance=questions.find(q=>q.key==='entrance-doors'&&q.status!=='ANSWERED');
  if(entrance){
    let group=assessment.unresolved.find(g=>g.key==='CLASSIFICATION');
    if(!group){group={key:'CLASSIFICATION',title:titles.CLASSIFICATION,findingIds:[],questionIds:[]};assessment.unresolved.push(group);}
    group.questionIds=[entrance.id,...group.questionIds.filter(id=>id!==entrance.id)];
  }
  assessment.phase=setup?'SETUP':assessment.unresolved.length?'REVIEW':assessment.results.length?'READY':'EMPTY';
  if(assessment.phase==='READY'){
    const good=assessment.results.filter(r=>r.status==='GOOD').length,total=assessment.results.length;
    assessment.summary={rating:Math.round(100*good/total),good,fail:total-good,total,estimated:assessment.results.filter(r=>r.estimated).length,excluded:assessment.excluded.length,attentionFindingIds:assessment.results.filter(r=>r.status==='FAIL').map(r=>r.findingId)};
  }
  return FindingsAssessmentSchema.parse(assessment);
}
