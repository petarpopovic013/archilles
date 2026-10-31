"use client";
import { useState } from 'react';
import type { DrawingSettings, GeometryReport } from '../../domain';
import { useWorkspace } from '../state/workspace';
import { Button, Section, inputClass } from './common';

export function GeometryPanel() {
  const {drawing,snapshot,readGeometryAgain,busy}=useWorkspace();
  if(!drawing)return null;
  const report=snapshot?.geometry;
  if(!report)return snapshot?<Section title="Drawing recognition"><p className="text-xs">{snapshot.elements.length?'This drawing uses an earlier extraction. Read it again to use the symbol legend and detailed geometry review.':'Drawing reading has not produced a usable geometry report. Check the activity for the error, then try reading again.'}</p><Button disabled={busy!==null||snapshot.session.status==="RUNNING"} onClick={()=>void readGeometryAgain()}>Read geometry again</Button></Section>:null;
  return <DrawingSetup key={`${drawing.id}:${snapshot.session.projectRevision}`} report={report}/>;
}
function DrawingSetup({report}:{report:GeometryReport}) {
  const {drawing,page,client,saveDrawingSetup,readGeometryAgain,busy,snapshot,select,startCalibration,calibrationPicking,calibrationPoints}=useWorkspace();
  const [unit,setUnit]=useState<DrawingSettings['unit']>(report.settings.unit);
  const [confirmed,setConfirmed]=useState(report.settings.confirmedLegendIds);
  const [length,setLength]=useState('');
  const running=snapshot?.session.status==='RUNNING',disabled=busy!==null||running;
  const save=()=>{
    const metres=Number(length);
    void saveDrawingSetup({unit,legendConfirmed:true,confirmedLegendIds:confirmed,
      ...(calibrationPoints.length===2&&metres>0?{calibration:{points:calibrationPoints,lengthM:metres}}:report.settings.calibration?{calibration:report.settings.calibration}:{})});
  };
  return <Section title="Drawing recognition">
    <p className="text-xs">{report.stage==='AWAITING_CONFIRMATION'?'Check these drawing conventions, then continue reading the details.':report.stage==='PARTIAL'?'Some geometry needs your review.':'Drawing reading completed. Review suggestions on the plan.'}</p>
    <label className="block text-xs">Dimension units
      <select aria-label="Drawing dimension units" className={inputClass} value={unit??''} disabled={disabled} onChange={e=>setUnit((e.target.value||null) as DrawingSettings['unit'])}>
        <option value="">Unknown — keep raw numbers</option><option value="cm">Centimetres</option><option value="mm">Millimetres</option><option value="m">Metres</option>
      </select>
    </label>
    <p className="text-[11px] text-slate-500">Units do not confirm dimensions or establish scale. Opening marks remain nominal sizes.</p>
    <details open={report.stage==='AWAITING_CONFIRMATION'}>
      <summary className="text-xs cursor-pointer">Drawing legend · {report.legend.length} examples</summary>
      <ul className="space-y-2 mt-2">{report.legend.map(item=>{
        const g=item.geometry,ps=g.kind==='BBOX'?{x:g.x,y:g.y,width:g.width,height:g.height}: {x:Math.min(...g.points.map(p=>p.x)),y:Math.min(...g.points.map(p=>p.y)),width:Math.max(...g.points.map(p=>p.x))-Math.min(...g.points.map(p=>p.x)),height:Math.max(...g.points.map(p=>p.y))-Math.min(...g.points.map(p=>p.y))};
        return <li key={item.id} className="rounded border border-slate-800 p-2">
          <svg viewBox={`${ps.x-5} ${ps.y-5} ${Math.max(10,ps.width)+10} ${Math.max(10,ps.height)+10}`} className="w-full h-20 bg-white" role="img" aria-label={`${item.kind} example from your drawing`}>
            <image href={client.getDrawingPageUrl(drawing!.id,page)} width={report.sourceWidth} height={report.sourceHeight}/>
          </svg>
          <label className="flex gap-2 text-[11px] mt-1"><input type="checkbox" checked={confirmed.includes(item.id)} disabled={disabled} onChange={e=>setConfirmed(e.target.checked?[...confirmed,item.id]:confirmed.filter(id=>id!==item.id))}/><span>{item.description}{item.uncertain?' · uncertain, please inspect':''}</span></label>
        </li>;
      })}</ul>
    </details>
    <Button variant="primary" className="w-full" disabled={disabled} onClick={save}>{report.stage==='AWAITING_CONFIRMATION'?'Confirm conventions and read details':'Save drawing settings'}</Button>
    <details>
      <summary className="text-xs cursor-pointer">Calibrate from a known span</summary>
      <p className="text-[11px] text-slate-500">Choose the exact two ends of a labelled span, then enter its actual length in metres.</p>
      <Button disabled={disabled} onClick={startCalibration}>{calibrationPicking?'Cancel point selection':'Select two points on plan'}</Button>
      {calibrationPoints.length>0&&<p className="text-[11px]">{calibrationPoints.length} of 2 points selected</p>}
      <label className="block text-xs">Known length (m)<input aria-label="Calibration length in metres" className={inputClass} type="number" min="0.001" step="any" value={length} onChange={e=>setLength(e.target.value)}/></label>
      <Button disabled={disabled||calibrationPoints.length!==2||!(Number(length)>0)} onClick={save}>Confirm this calibration</Button>
      {report.settings.calibration&&<p className="text-[11px]">A confirmed calibration span is stored for this page. {report.metresPerPixel ? `${report.metresPerPixel.toPrecision(5)} m per source pixel.` : ""}</p>}
    </details>
    {report.issues.length>0&&<details open><summary className="text-xs">Geometry review · {report.issues.length} issues</summary><ul className="space-y-1">{report.issues.map((issue,i)=><li key={i} className="text-[11px] rounded border border-amber-800 p-2">{issue.message}{issue.elementIds[0]&&<Button onClick={()=>select({kind:'element',id:issue.elementIds[0]})}>Inspect</Button>}</li>)}</ul></details>}
    {report.warnings.length>0&&<details><summary className="text-xs">Reading notes</summary><ul>{report.warnings.map((w,i)=><li key={i} className="text-[11px]">{w}</li>)}</ul></details>}
    <p className="text-[11px] text-slate-500">{report.calls} Vision calls · total estimated ${(report.estimatedCostUsd+(report.controllerCostUsd??0)).toFixed(3)} · {report.regions.filter(r=>r.processed).length}/{report.regions.length} detail regions read</p>
    <Button className="w-full" disabled={disabled} onClick={()=>void readGeometryAgain()}>Read geometry again</Button>
    <p className="text-[11px] text-slate-500">Reading again uses AI credits. Confirmed corrections and earlier versions are preserved.</p>
  </Section>;
}
