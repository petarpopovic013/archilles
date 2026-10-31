import type { ComplianceFinding, RuleEvaluation, ReviewQuestion } from '../domain';
export const effectiveStatus=(item:Pick<RuleEvaluation,'status'|'preliminary'>)=>item.preliminary?.status??item.status;
export const findingRank=(item:Pick<ComplianceFinding,'status'|'preliminary'>)=> {
  const status=effectiveStatus(item);
  return status==='FAIL'?(item.preliminary?1:0):status==='NEEDS_REVIEW'?2:status==='UNKNOWN'?3:status==='PASS'?4:5;
};

export function questionForFinding(q:ReviewQuestion,f:ComplianceFinding){
  return q.ruleIds.includes(f.ruleId)&&q.status!=='ANSWERED'&&(!f.elementId||q.candidateIds.length===0||q.candidateIds.includes(f.elementId));
}
export function preliminaryLabel(item:Pick<ComplianceFinding,'status'|'preliminary'>){
  if(!item.preliminary)return undefined;
  return ({PASS:'Preliminary pass',FAIL:'Potential issue',NOT_APPLICABLE:'Likely not applicable',UNKNOWN:'Unclear',NEEDS_REVIEW:'Review needed'})[item.preliminary.status];
}
