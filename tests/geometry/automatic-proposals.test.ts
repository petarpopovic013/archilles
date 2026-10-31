import assert from 'node:assert/strict';
import test from 'node:test';
import {drawingProposals} from '../../runtime/services/assumptions';
import {GeometryReportSchema} from '../../src/domain';
import {element,rule,testId,NOW} from '../engine/fixtures';
const box={kind:'BBOX' as const,x:10,y:10,width:90,height:20};
const report=()=>GeometryReportSchema.parse({sourceWidth:800,sourceHeight:600,version:'test',stage:'COMPLETE',settings:{unit:'cm',legendConfirmed:false,confirmedLegendIds:[]},legend:[],annotations:[],issues:[],warnings:[],regions:[],openings:[],calls:1,inputTokens:1,outputTokens:1,estimatedCostUsd:0});
test('nominal annotations become unverified scenarios and never confirmed clear widths',()=>{
  const e=element('DOOR',{geometry:box}),r=report();
  r.annotations=[{id:testId(),elementId:e.id,text:'90/210',geometry:box,kind:'NOMINAL_OPENING',direction:'UNKNOWN',association:'SUGGESTED'}];
  const proposals=drawingProposals(r,[e],[],[rule({elementType:'DOOR'})],2,NOW);
  assert.equal(proposals[0].value,.9);assert.equal(proposals[0].verification,'UNVERIFIED');assert.equal(proposals[0].source,'AI_ESTIMATE');
  r.settings.unit=null;assert.equal(drawingProposals(r,[e],[],[rule({elementType:'DOOR'})],2,NOW).length,0);
});
test('conflicting spans do not silently establish an automatic scale',()=>{
  const e=element('DOOR',{geometry:box}),r=report();
  r.annotations=[1,2].map((n)=>({id:testId(),text:String(100*n),geometry:box,kind:'DIMENSION',direction:'HORIZONTAL',span:[{x:0,y:0},{x:100,y:0}],unit:'cm',association:'SUGGESTED'}));
  assert.equal(drawingProposals(r,[e],[],[rule({elementType:'DOOR'})],2,NOW).length,0);assert.equal(r.automaticScale,undefined);
  r.annotations.pop();const proposals=drawingProposals(r,[e],[],[rule({elementType:'DOOR'})],2,NOW);
  assert.equal(GeometryReportSchema.parse(r).automaticScale?.metresPerPixel,.01);assert.equal(proposals[0].value,.9);assert.equal(proposals[0].verification,'UNVERIFIED');
});

test('semantic fallback stays AI-owned and never overwrites a human category',async()=>{
  const {categoryProposals}=await import('../../runtime/services/assumptions');
  const a=element('DOOR',{extraction:'AI_SUGGESTED',subtype:undefined}),human=element('DOOR',{subtype:'OTHER'});
  const rules=[rule({elementType:'DOOR',applicability:{op:'EQ',field:'element.subtype',value:'ACCESSIBLE_INTERNAL_DOOR_ART22'}})];
  const proposed=categoryProposals([a,human],undefined,rules);
  assert.equal(proposed.length,1);assert.equal(proposed[0].extraction,'AI_SUGGESTED');assert.equal(proposed[0].subtype,'ACCESSIBLE_INTERNAL_DOOR_ART22');assert.match(proposed[0].classificationReason!,/ASSUMED_INTERNAL/);assert.equal(human.subtype,'OTHER');
});
test('scale preparation is requested even when subtype uncertainty masks missing dimensions',async()=>{
  const {questionCandidates}=await import('../../runtime/services/questions');
  const {evaluateRules}=await import('../../src/rules/engine');
  const {context}=await import('../engine/fixtures');
  const e=element('DOOR',{extraction:'AI_SUGGESTED',subtype:undefined}),r=rule({elementType:'DOOR',applicability:{op:'EQ',field:'element.subtype',value:'TEST_ENTRY'}}),g=report();
  g.settings.unit=null;g.annotations=[{id:testId(),elementId:e.id,text:'90/210',geometry:box,kind:'NOMINAL_OPENING',direction:'UNKNOWN',association:'SUGGESTED'}];
  const evaluations=evaluateRules([r],context({elements:[e]})).results.map(r=>r.evaluation);
  assert.equal(evaluations[0].missingInputs.length,0);
  assert.equal(questionCandidates(evaluations,[e],[r],g)[0].kind,'UNIT');
  g.settings.unit='cm';assert.equal(questionCandidates(evaluations,[e],[r],g)[0].kind,'CALIBRATION');
});
