import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRules } from '../../src/rules/engine';
import { context, element, measurement, rule } from './fixtures';

test('AI subtypes and unverified dimensions produce a separate preliminary outcome',()=>{
  const e=element('DOOR',{extraction:'AI_SUGGESTED',subtype:'TEST_ENTRY'});
  const r=rule({elementType:'DOOR',applicability:{op:'EQ',field:'element.subtype',value:'TEST_ENTRY'}});
  for(const [value,status] of [[1.05,'FAIL'],[1.55,'PASS']] as const){
    const m=measurement(e,'CLEAR_WIDTH_M',value,{verification:'UNVERIFIED',source:'AI_ESTIMATE'});
    const before=structuredClone({e,m});
    const result=evaluateRules([r],context({elements:[e],measurements:[m]})).results[0].evaluation;
    assert.equal(result.status,'UNKNOWN');assert.equal(result.preliminary?.status,status);
    assert.equal(result.preliminary?.assumptions.length,2);assert.deepEqual({e,m},before);
  }
});
test('preliminary mode cannot guess missing project facts, exceptions or dimensions',()=>{
  const e=element('DOOR',{extraction:'AI_SUGGESTED',subtype:'TEST_ENTRY'}),m=measurement(e,'CLEAR_WIDTH_M',1,{verification:'UNVERIFIED'});
  for(const r of [
    rule({elementType:'DOOR',applicability:{op:'GTE',field:'occupantCount',value:10}}),
    rule({elementType:'DOOR',exceptionConditions:[{op:'EQ',field:'characteristic',key:'hasRamp',value:true}]}),
  ])for(const value of [1,1.55])assert.equal(evaluateRules([r],context({elements:[e],measurements:[{...m,value}]})).results[0].evaluation.preliminary,undefined);
  assert.equal(evaluateRules([rule({elementType:'DOOR'})],context({elements:[e]})).results[0].evaluation.preliminary,undefined);
});
test('a human-confirmed result has no preliminary duplicate',()=>{
  const e=element('CORRIDOR'),m=measurement(e,'CLEAR_WIDTH_M',1.55);
  const result=evaluateRules([rule()],context({elements:[e],measurements:[m]})).results[0].evaluation;
  assert.equal(result.status,'PASS');assert.equal(result.preliminary,undefined);
});
