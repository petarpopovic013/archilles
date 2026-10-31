"use client";
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import type {FindingsAssessment} from '../../domain';
import {useWorkspace} from '../state/workspace';
import {Button,Icon} from './common';

export function FindingsSummary({summary,onClose}:{summary:NonNullable<FindingsAssessment['summary']>;onClose():void}){
  const {snapshot,select}=useWorkspace();
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
  const radius=58,circumference=2*Math.PI*radius;
  return createPortal(<dialog ref={dialog} className="findings-summary" aria-labelledby="findings-summary-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();}}}>
    <div className="flex items-center justify-between gap-3"><div><p className="summary-eyebrow">Drawing review</p><h2 id="findings-summary-title">Findings summary</h2></div><Button variant="ghost" aria-label="Close findings summary" onClick={onClose}><Icon name="close"/></Button></div>
    <div className="summary-rating">
      <div className="summary-ring" role="progressbar" aria-label="Good results among reviewed checks" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary.rating} aria-valuetext={`${summary.good} of ${summary.total} reviewed checks are good`}>
        <svg viewBox="0 0 140 140" aria-hidden="true"><circle cx="70" cy="70" r={radius} fill="none" stroke="#e8ece2" strokeWidth="9"/><circle cx="70" cy="70" r={radius} fill="none" stroke={summary.fail?'#b27c36':'#547143'} strokeWidth="9" strokeDasharray={circumference} strokeDashoffset={circumference*(1-summary.rating/100)} strokeLinecap="round" transform="rotate(-90 70 70)"/></svg><strong>{summary.rating}<span>%</span></strong>
      </div>
      <div><h3>Reviewed checks rating</h3><p>{summary.good} good · {summary.fail} fail</p><p className="summary-muted">Based on {summary.total} evaluated check{summary.total===1?'':'s'}.</p></div>
    </div>
    <section aria-labelledby="summary-attention"><h3 id="summary-attention">Things to pay attention to</h3>{summary.attentionFindingIds.length?<ul>{summary.attentionFindingIds.map(id=>{const finding=snapshot?.findings.find(f=>f.id===id);if(!finding)return null;const element=snapshot?.elements.find(e=>e.id===finding.elementId);return <li key={id}><button onClick={()=>{select({kind:'finding',id});onClose();}}><span className="summary-fail">Fail</span><strong>{finding.title}</strong>{element&&<span>{element.label??element.type.toLowerCase()}</span>}</button></li>;})}</ul>:<p className="summary-muted">No failed checks in the reviewed set.</p>}</section>
    <p className="summary-scope">{summary.estimated>0?`${summary.estimated} result${summary.estimated===1?' uses':'s use'} recorded AI assumptions. `:''}{summary.excluded} check{summary.excluded===1?' was':'s were'} outside this review. This rating describes the checks above, not the whole building.</p>
    <Button variant="primary" className="w-full" onClick={onClose}>Back to findings</Button>
  </dialog>,document.body);
}
