/** Explicit, budgeted, isolated REAL provider check. Never part of npm test. */
import Anthropic from '@anthropic-ai/sdk';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {startRuntime} from '../runtime/app';
import {loadConfig} from '../runtime/config';
import {createPendingRegistry} from '../runtime/adapters/pending-registry';
import {ClaudeInferenceRunner} from '../runtime/ai/inference';
import {createNodePageRenderer} from '../src/geometry/node-renderer';
import {createDrawingVisionRunner} from '../src/vision/pipeline';
import {AnalysisSnapshotSchema,ProjectSchema,UploadDrawingResponseSchema} from '../src/domain';
import {listSessionRuns} from '../runtime/db/repo';
import {pathOf} from '../src/ui/viewer/transforms';
import {iou} from '../src/geometry/topology';

const arg=(key:string)=>{const i=process.argv.indexOf(key);return i<0?undefined:process.argv[i+1];};
async function main(){
  if(!process.env.ANTHROPIC_API_KEY)throw new Error('ANTHROPIC_KEY_REQUIRED');
  const plan=arg('--plan')??'fixtures/plans/residential-dimensioned.png',out=arg('--output')??await mkdtemp(path.join(tmpdir(),'archilles-geometry-report-'));
  const page=Number(arg('--page')??1),ext=path.extname(plan).toLowerCase(),mime=ext==='.pdf'?'application/pdf':ext==='.png'?'image/png':'image/jpeg';
  const base=loadConfig(),dataDir=await mkdtemp(path.join(tmpdir(),'archilles-geometry-live-'));
  await mkdir(out,{recursive:true,mode:0o700});
  const client=new Anthropic({maxRetries:0});
  const app=await startRuntime({config:{...base,port:0,dataDir,databasePath:path.join(dataDir,'test.sqlite'),aiBudgetUsd:Math.min(base.aiBudgetUsd,2),aiHourlyLimitUsd:Math.min(base.aiHourlyLimitUsd,2)},registry:createPendingRegistry(),geometry:{renderer:createNodePageRenderer(),vision:createDrawingVisionRunner(client,base.visionModel,{onValidationError:issues=>console.log(JSON.stringify({phase:'validation',issues}))})},inferenceRunner:new ClaudeInferenceRunner(client)});
  const json=async(method:string,url:string,body:unknown)=>{
    const r=await fetch(app.url+url,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)}),v=await r.json();if(!r.ok)throw new Error(v.code??'HTTP_ERROR');return v;
  };
  const settle=async(id:string)=>{
    const deadline=Date.now()+900_000;
    for(;;){const r=AnalysisSnapshotSchema.parse(await(await fetch(`${app.url}/api/analyses/${id}`)).json());if(r.session.status!=='RUNNING')return r;if(Date.now()>deadline)throw new Error('BENCHMARK_TIMEOUT');await new Promise(r=>setTimeout(r,300));}
  };
  try{
    const project=ProjectSchema.parse(await json('POST','/api/projects',{name:'Geometry recognition verification',purpose:'OTHER'}));
    const form=new FormData();form.append('file',new Blob([await readFile(plan)],{type:mime}),path.basename(plan));form.append('baseRevision','1');form.append('selectedPage',String(page));
    const r=await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form});const {drawing}=UploadDrawingResponseSchema.parse(await r.json());
    const started=await json('POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page});
    const result=await settle(started.sessionId);
    const runs=listSessionRuns(app.ctx.db,started.sessionId);
    const report=result.geometry;
    if(!report)throw new Error('GEOMETRY_REPORT_MISSING');
    await writeFile(path.join(out,'stages.json'),JSON.stringify(app.ctx.db.prepare('SELECT cache_key,data FROM geometry_stage_cache ORDER BY rowid').all().map(r=>{const row=r as {cache_key:string;data:string};return {key:row.cache_key,data:JSON.parse(row.data)};}),null,2),{mode:0o600});
    const raster=Buffer.from(await(await fetch(`${app.url}/api/drawings/${drawing.id}/pages/${page}`)).arrayBuffer());
    const colors=['#0891b2','#c026d3','#dc2626','#15803d','#b45309'];
    const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${report.sourceWidth}" height="${report.sourceHeight}"><image href="data:image/png;base64,${raster.toString('base64')}" width="100%" height="100%"/>${result.elements.map((e,i)=>`<path d="${pathOf(e.geometry)}" fill="${colors[i%5]}18" stroke="${colors[i%5]}" stroke-width="2"/><text x="${e.geometry.kind==='BBOX'?e.geometry.x:e.geometry.points[0].x}" y="${e.geometry.kind==='BBOX'?e.geometry.y:e.geometry.points[0].y}" fill="${colors[i%5]}" font-size="14">${i+1}: ${escape(e.type+' '+(e.label??''))}</text>`).join('')}</svg>`;
    await writeFile(path.join(out,'observations.json'),JSON.stringify({result,runs},null,2),{mode:0o600});
    await writeFile(path.join(out,'overlay.svg'),svg,{mode:0o600});
    await sharp(Buffer.from(svg)).png().toFile(path.join(out,'overlay.png'));
    let metrics:unknown;
    const reference=arg('--reference');
    if(reference){const expected=JSON.parse(await readFile(reference,'utf8')) as {provenance:string;rooms:Array<{label:string;geometry:typeof result.elements[number]['geometry']}>};metrics={provenance:expected.provenance,rooms:expected.rooms.map(e=>{const matches=result.elements.filter(a=>a.type==='ROOM'||a.type==='CORRIDOR').map(a=>({label:a.label,iou:iou(e.geometry,a.geometry)})).sort((a,b)=>b.iou-a.iou);return {reference:e.label,best:matches[0]??null};})};await writeFile(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2),{mode:0o600});}
    console.log(JSON.stringify({phase:'result',directory:out,status:result.session.status,stage:report.stage,elements:result.elements.map((e,i)=>({number:i+1,type:e.type,label:e.label})),issues:report.issues.map(i=>i.code),calls:report.calls,costUsd:runs.reduce((n,r)=>n+(r.estimatedCostUsd??0),0),metrics}));
  }finally{await app.close();await rm(dataDir,{recursive:true,force:true});}
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:'BENCHMARK_FAILED');process.exitCode=1;});
