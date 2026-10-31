"use client";
import { useState, type FormEvent, type CSSProperties } from 'react';
import { unitForMetric, type ArchitecturalElement, type DrawingSettings, type Metric, type ReviewAnswer, type ReviewQuestion } from '../../domain';
import { useWorkspace } from '../state/workspace';
import { activeCategories, categoryLabel, OTHER_SUBTYPE } from '../guidance';
import { metricLabel } from '../format';
import { Button, inputClass } from './common';

export function ReviewQuestionCard({question,selectedIds,onSkip,onClose,style}:{question:ReviewQuestion;selectedIds:string[];onSkip():void;onClose():void;style?:CSSProperties}) {
  const {snapshot,answerQuestion,busy,startCalibration,calibrationPoints,calibrationPicking,requirements}=useWorkspace();
  const m=snapshot?.measurements.find(m=>m.elementId===question.candidateIds[0]&&m.metric===question.metric);
  const [value,setValue]=useState(m?String(m.value):'');
  const [unit,setUnit]=useState<'m'|'cm'|'mm'>('cm');
  const [choice,setChoice]=useState('');
  const title=question.kind==='CLASSIFICATION'&&question.subtype?`Select ${categoryLabel(question.subtype).toLowerCase()} on the plan`:question.kind==='MEASUREMENT'&&question.metric?`Confirm ${metricLabel[question.metric].toLowerCase()}`:question.title;
  const disabled=busy!==null;
  const submit=(e:FormEvent)=>{
    e.preventDefault();let answer:Omit<ReviewAnswer,'baseRevision'>={action:'ANSWER'};
    if(question.kind==='CLASSIFICATION')answer={...answer,elementIds:selectedIds};
    else if(question.kind==='UNIT')answer={...answer,unit};
    else if(question.kind==='CALIBRATION')answer={...answer,points:calibrationPoints,lengthM:Number(value)};
    else if(question.kind==='PROJECT')answer={...answer,value:question.field?.startsWith('characteristic.')?choice==='yes':question.field==='classification'?choice:Number(value)};
    else answer={...answer,value:Number(value)};
    void answerQuestion(question.id,answer);
  };
  const valid=question.kind==='CLASSIFICATION'?selectedIds.length>0:question.kind==='UNIT'?true:question.kind==='PROJECT'&&(question.field?.startsWith('characteristic.')||question.field==='classification')?!!choice:value.trim()!==''&&Number.isFinite(Number(value))&&(question.kind==='CALIBRATION'?Number(value)>0&&calibrationPoints.length===2:Number(value)>=0);
  return <form className="plan-review-card" style={style} onSubmit={submit} aria-label="Quick review question" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div className="flex justify-between gap-3"><span className="text-[10px] uppercase tracking-wider text-slate-500">{question.automatic?'Quick review · up to 5 questions':'Review this finding'}</span><button type="button" onClick={onClose} aria-label="Close quick review">×</button></div>
    <p className="text-sm font-semibold my-2">{title}</p>
    {question.kind==='CLASSIFICATION'&&<p className="text-xs mb-2">Only relevant elements are highlighted. Click to select; click again to deselect. {selectedIds.length} selected.</p>}
    {question.kind==='UNIT'&&<select aria-label="Dimension unit" value={unit} onChange={e=>setUnit(e.target.value as typeof unit)} className={inputClass}><option value="mm">Millimetres</option><option value="cm">Centimetres</option><option value="m">Metres</option></select>}
    {question.kind==='CALIBRATION'&&<><Button disabled={disabled} onClick={startCalibration}>{calibrationPicking?'Cancel selection':'Select two points'}</Button><p className="text-xs my-2">{calibrationPoints.length}/2 points · enter the actual distance in metres.</p></>}
    {question.kind==='PROJECT'&&question.field?.startsWith('characteristic.')?<select aria-label={question.title} className={inputClass} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>:question.kind==='PROJECT'&&question.field==='classification'?<select aria-label="Building classification" className={inputClass} value={choice} onChange={e=>setChoice(e.target.value)}><option value="">Choose…</option>{requirements?.classifications.map(c=><option key={c}>{c}</option>)}</select>:['MEASUREMENT','CALIBRATION','PROJECT'].includes(question.kind)&&<label className="block text-xs">{question.kind==='CALIBRATION'?'Known length (m)':question.metric?`${metricLabel[question.metric]} (${unitForMetric(question.metric)})`:'Value'}<input autoFocus className={inputClass} type="number" step="any" min="0" value={value} onChange={e=>setValue(e.target.value)} /></label>}
    <div className="flex gap-2 mt-3"><Button type="submit" variant="primary" disabled={disabled||!valid}>Confirm</Button><Button disabled={disabled} onClick={onSkip}>Skip</Button>{question.kind==='CLASSIFICATION'&&<Button disabled={disabled} onClick={()=>void answerQuestion(question.id,{action:'NOT_PRESENT'})}>Not on this plan</Button>}</div>
  </form>;
}

export function ElementQuickEdit({element,style,onClose}:{element:ArchitecturalElement;style:CSSProperties;onClose():void}) {
  const {snapshot,requirements,confirmMeasurement,confirmElement,retireElement,busy}=useWorkspace();
  const choices=activeCategories(requirements,element.type);
  const metrics=[...new Set(requirements?.subtypes.filter(s=>s.elementType===element.type&&(!element.subtype||s.subtype===element.subtype)).flatMap(s=>s.rules.filter(r=>r.lifecycle==='ACTIVE').flatMap(r=>r.metrics))??[])];
  const [metric,setMetric]=useState<Metric>(metrics[0]??'CLEAR_WIDTH_M');
  const current=snapshot?.measurements.filter(m=>m.elementId===element.id&&m.metric===metric).at(-1);
  const [value,setValue]=useState(current?String(current.value):'');
  const [category,setCategory]=useState(element.subtype??'');
  const [editingCategory,setEditingCategory]=useState(false);
  const [removing,setRemoving]=useState(false);
  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    const success=editingCategory?await confirmElement(element.id,{subtype:category}):await confirmMeasurement(element.id,metric,Number(value.replace(',','.')));
    if(success)onClose();
  };
  return <form className="plan-review-card plan-element-input" style={style} onSubmit={submit} aria-label="Edit selected element" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <div className="flex items-center justify-between gap-2"><strong className="text-xs">{element.label??element.type.toLowerCase()}</strong><button type="button" onClick={onClose} aria-label="Close element input">×</button></div>
    {current?.verification==='UNVERIFIED'&&<p className="text-[10px] text-amber-700 mt-1">AI estimate · confirm against the drawing</p>}
    <div className="flex flex-wrap items-end gap-2 mt-2">
      {editingCategory?<label className="flex-1 text-xs">Category<select className={inputClass} value={category} onChange={e=>setCategory(e.target.value)}><option value="">Choose…</option>{[...choices,OTHER_SUBTYPE].map(c=><option key={c} value={c}>{categoryLabel(c,element.type)}</option>)}</select></label>:<><label className="text-xs flex-1">Measurement<select aria-label="Measurement to correct" className={inputClass} value={metric} onChange={e=>{const next=e.target.value as Metric;setMetric(next);setValue(String(snapshot?.measurements.filter(m=>m.elementId===element.id&&m.metric===next).at(-1)?.value??''));}}>{[...new Set([metric,...metrics])].map(m=><option key={m} value={m}>{metricLabel[m]} ({unitForMetric(m)})</option>)}</select></label><input autoFocus aria-label="Measurement value" className={inputClass+' !w-24'} type="text" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)} /></>}
      <Button type="submit" variant="primary" disabled={busy!==null||(editingCategory?!category:!value.trim()||!Number.isFinite(Number(value.replace(',','.')))||Number(value.replace(',','.'))<0)}>Confirm</Button>
    </div>
    {choices.length>0&&<button type="button" className="text-[11px] underline mt-2" onClick={()=>setEditingCategory(!editingCategory)}>{editingCategory?'Edit measurement':'Change category'}</button>}
    <details className="text-[11px] mt-2"><summary>More options</summary>{!removing?<Button onClick={()=>setRemoving(true)}>Remove incorrect element</Button>:<div><p>Remove this element from the current drawing review?</p><Button disabled={busy!==null} onClick={async()=>{if(await retireElement(element.id))onClose();}}>Remove element</Button><Button onClick={()=>setRemoving(false)}>Keep element</Button></div>}</details>
  </form>;
}

export function AnalysisSettings({onClose,onCalibrate}:{onClose():void;onCalibrate():void}) {
  const {snapshot,saveDrawingSetup,readGeometryAgain,busy}=useWorkspace();
  const settings=snapshot?.geometry?.settings;
  const [unit,setUnit]=useState<DrawingSettings['unit']>(settings?.unit??null);
  return <div className="plan-review-card" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()}>
    <div className="flex justify-between"><strong>Adjust analysis</strong><button aria-label="Close analysis settings" onClick={onClose}>×</button></div>
    <p className="text-xs my-2">Select an element on the plan to correct its measurement or category.</p>
    <label className="text-xs">Dimension units<select aria-label="Dimension units" className={inputClass} value={unit??''} onChange={e=>setUnit((e.target.value||null) as DrawingSettings['unit'])}><option value="">Unknown</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option></select></label>
    <Button disabled={busy!==null||!settings} onClick={()=>settings&&void saveDrawingSetup({...settings,unit,unitSource:'USER'})}>Save units</Button>
    <Button disabled={busy!==null} onClick={onCalibrate}>Calibrate a known span</Button>
    <details className="mt-3 text-xs"><summary>Advanced</summary><p className="my-2">Reading again uses AI credits and preserves your corrections.</p><Button disabled={busy!==null||snapshot?.session.status==='RUNNING'} onClick={()=>void readGeometryAgain()}>Read geometry again</Button></details>
  </div>;
}

export function CalibrationInput({style,onClose}:{style:CSSProperties;onClose():void}) {
  const {snapshot,calibrationPoints,saveDrawingSetup,busy}=useWorkspace();
  const [length,setLength]=useState('');
  return <form className="plan-review-card" style={style} aria-label="Known calibration distance" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onClose();}}} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onSubmit={async e=>{e.preventDefault();const settings=snapshot?.geometry?.settings;if(settings&&await saveDrawingSetup({...settings,calibration:{points:calibrationPoints,lengthM:Number(length)}}))onClose();}}>
    <label className="text-xs">Known distance (m)<input autoFocus className={inputClass} type="number" step="any" min="0.001" value={length} onChange={e=>setLength(e.target.value)}/></label>
    <div className="flex gap-2 mt-2"><Button type="submit" variant="primary" disabled={busy!==null||calibrationPoints.length!==2||!(Number(length)>0)}>Confirm distance</Button><Button onClick={onClose}>Cancel</Button></div>
  </form>;
}
