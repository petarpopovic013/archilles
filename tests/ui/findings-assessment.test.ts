import test from 'node:test';
import assert from 'node:assert/strict';
import {assessFindings} from '../../src/review/assessment';
import {evaluateRules} from '../../src/rules/engine';
import {templateFinding} from '../../runtime/services/findings';
import {context,element,measurement,rule,NOW,testId} from '../engine/fixtures';
import type {ReviewQuestion,RuleEvaluation} from '../../src/domain';
function fixture(widths:number[]){
  const r=rule(),elements=widths.map(()=>element('CORRIDOR'));
  const measurements=elements.map((e,i)=>measurement(e,'CLEAR_WIDTH_M',widths[i]));
  const evaluations=evaluateRules([r],context({elements,measurements})).results.map(r=>r.evaluation);
  const findings=evaluations.map(e=>templateFinding(e,r,elements.find(el=>el.id===e.elementId),NOW));
  return {status:'COMPLETE' as const,elements,evaluations,findings,questions:[] as ReviewQuestion[]};
}
test('two distinct plan inputs produce data-dependent circle ratings and failed-item lists',()=>{
  const a=assessFindings(fixture([1.05,1.55])),b=assessFindings(fixture([1.55,1.65]));
  assert.equal(a.summary?.rating,50);assert.equal(a.summary?.attentionFindingIds.length,1);
  assert.equal(b.summary?.rating,100);assert.equal(b.summary?.attentionFindingIds.length,0);
});
test('setup blocks the summary even when some numeric checks are already good',()=>{
  const f=fixture([1.55]);f.questions=[{id:testId(),key:'calibration',kind:'CALIBRATION',title:'Known distance',ruleIds:[],candidateIds:[],automatic:true,status:'PENDING'}];
  const result=assessFindings(f);assert.equal(result.phase,'SETUP');assert.equal(result.summary,undefined);
});
test('many missing facts collapse into at most five groups without becoming good results',()=>{
  const f=fixture(Array(30).fill(1.55));
  f.evaluations=f.evaluations.map((e,i)=>({...e,status:'UNKNOWN' as const,reasonCode:'APPLICABILITY_UNKNOWN',unknownFacts:[i%2?'element.subtype':'classification']}));
  f.findings=f.findings.map((finding,i)=>({...finding,status:'UNKNOWN' as const,evaluationId:f.evaluations[i].id}));
  const before=structuredClone(f.evaluations),result=assessFindings(f);
  assert.equal(result.unresolved.length,2);assert.equal(result.results.length,0);assert.equal(result.summary,undefined);assert.deepEqual(f.evaluations,before);
});
test('resolving the grouped unknowns exposes the summary; missing elements stay out of the score',()=>{
  const f=fixture([1.55]);const extra:RuleEvaluation={...f.evaluations[0],id:testId(),elementId:undefined,status:'UNKNOWN',reasonCode:'NO_MATCHING_ELEMENTS',unknownFacts:['element.type']};
  f.evaluations.push(extra);f.findings.push({...f.findings[0],id:testId(),evaluationId:extra.id,elementId:undefined,status:'UNKNOWN'});
  const result=assessFindings(f);assert.equal(result.phase,'READY');assert.equal(result.summary?.total,1);assert.equal(result.summary?.excluded,1);
});
test('zero checked items and stale findings never produce a 100 percent rating',()=>{
  const f=fixture([]);assert.equal(assessFindings(f).summary,undefined);
  const stale=fixture([1.55]);stale.findings[0].stale=true;assert.equal(assessFindings(stale).summary,undefined);
});
test('an AI binary result counts as estimated and cannot hide a pending entrance question',()=>{
  const f=fixture([1.55]);f.findings[0]={...f.findings[0],status:'UNKNOWN',preliminary:{status:'PASS',observed:1.55,required:1.2,unit:'m',reasonCode:'MIN_SATISFIED',assumptions:['Test AI assumption'],evidenceIds:[]}};
  assert.equal(assessFindings(f).summary?.estimated,1);
  f.questions=[{id:testId(),key:'entrance-doors',kind:'CLASSIFICATION',title:'Mark entrance',ruleIds:[],candidateIds:[],automatic:true,status:'PENDING'}];assert.equal(assessFindings(f).summary,undefined);
  f.questions[0]={...f.questions[0],status:'ANSWERED',resolution:'NOT_PRESENT'};assert.equal(assessFindings(f).phase,'READY');
});
