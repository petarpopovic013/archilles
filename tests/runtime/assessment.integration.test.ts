import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startRuntime,type RuntimeApp} from '../../runtime/app';
import {createNodePageRenderer} from '../../src/geometry/node-renderer';
import {AnalysisSnapshotSchema,GeometryReportSchema,ProjectSchema,UploadDrawingResponseSchema} from '../../src/domain';
import {latestSessionForProject} from '../../runtime/db/repo';
import {fakeVision,fakeRegistry,fakeInference,corridorPlan} from './fakes';
import {testConfig,removeDataDir,call,waitFor} from './helpers';
import {rule} from '../engine/fixtures';
const config=testConfig();let pageIndex=0;
const vision=fakeVision(()=>corridorPlan(++pageIndex===1?1.05:1.55)),baseRun=vision.run.bind(vision);
vision.run=async(...args)=>({...await baseRun(...args),report:GeometryReportSchema.parse({sourceWidth:800,sourceHeight:600,version:'test-only',stage:'COMPLETE',settings:{unit:'m',legendConfirmed:false,confirmedLegendIds:[]},legend:[],annotations:[],issues:[],warnings:[],regions:[],openings:[],calls:1,inputTokens:1,outputTokens:1,estimatedCostUsd:0})});
let app:RuntimeApp;
before(async()=>{app=await startRuntime({config,registry:fakeRegistry([rule(),rule({elementType:'DOOR',evaluation:{kind:'MIN',metric:'CLEAR_WIDTH_M',threshold:.9,unit:'m'}})]),inferenceRunner:fakeInference(),geometry:{renderer:createNodePageRenderer(),vision}});});
after(async()=>{await app.close();removeDataDir(config);});
async function settled(id:string){return waitFor(async()=>{const s=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${id}`)).body);return s.session.status==='RUNNING'?undefined:s;});}
test('calibration precedes findings and one known span resolves dependent checks on two distinct plans without Vision reruns',async()=>{
  for(const filename of ['office-a.png','office-b.jpg']){
    const project=ProjectSchema.parse((await call(app.url,'POST','/api/projects',{name:'Synthetic review readiness'})).body);
    const form=new FormData();form.append('file',new Blob([await readFile(`fixtures/plans/${filename}`)],{type:filename.endsWith('.jpg')?'image/jpeg':'image/png'}),filename);form.append('baseRevision','1');
    const {drawing}=UploadDrawingResponseSchema.parse(await(await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form})).json());
    const started=await call(app.url,'POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page:1});
    let snapshot=await settled(started.body.sessionId as string);assert.equal(snapshot.assessment?.phase,'SETUP');assert.equal(snapshot.assessment?.summary,undefined);
    const calibration=snapshot.questions!.find(q=>q.id===snapshot.assessment!.setupQuestionId)!;assert.equal(calibration.kind,'CALIBRATION');
    const invalid=await call(app.url,'POST',`/api/analyses/${snapshot.session.id}/questions/${calibration.id}`,{baseRevision:2,action:'ANSWER',points:[{x:10,y:10},{x:10,y:10}],lengthM:2});assert.equal(invalid.status,422);
    const calls=vision.calls;
    const answer=await call(app.url,'POST',`/api/analyses/${snapshot.session.id}/questions/${calibration.id}`,{baseRevision:2,action:'ANSWER',points:[{x:10,y:10},{x:110,y:10}],lengthM:2});assert.equal(answer.status,200);
    snapshot=await settled(latestSessionForProject(app.ctx.db,project.id)!.id);
    assert.equal(vision.calls,calls);assert.equal(snapshot.assessment?.phase,'READY');assert.equal(snapshot.assessment?.unresolved.length,0);
    assert.equal(snapshot.assessment?.summary?.rating,filename.endsWith('.png')?50:100);
    assert.ok(snapshot.measurements.filter(m=>m.source==='AI_ESTIMATE').every(m=>m.verification==='UNVERIFIED'));
  }
});
