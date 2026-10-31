import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {before,after,test} from 'node:test';
import {startRuntime,type RuntimeApp} from '../../runtime/app';
import {AnalysisSnapshotSchema,ProjectSchema,UploadDrawingResponseSchema} from '../../src/domain';
import {latestSessionForProject} from '../../runtime/db/repo';
import {createNodePageRenderer} from '../../src/geometry/node-renderer';
import {rule} from '../engine/fixtures';
import {fakeRegistry,fakeInference,fakeVision,corridorPlan} from './fakes';
import {testConfig,call,waitFor,removeDataDir} from './helpers';
const config=testConfig(),vision=fakeVision(()=>corridorPlan(1.05));
const rules=Array.from({length:8},(_,i)=>rule({elementType:'DOOR',applicability:{op:'EQ',field:'element.subtype',value:`TEST_CATEGORY_${i}`}}));
let app:RuntimeApp;
before(async()=>{app=await startRuntime({config,registry:fakeRegistry(rules),inferenceRunner:fakeInference(),geometry:{renderer:createNodePageRenderer(),vision}});});
after(async()=>{await app.close();removeDataDir(config);});
async function settled(id:string){return waitFor(async()=>{const s=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${id}`)).body);return s.session.status==='RUNNING'?undefined:s;});}
async function create(filename:string){
  const project=ProjectSchema.parse((await call(app.url,'POST','/api/projects',{name:'Quick review fixture'})).body);
  const form=new FormData();form.append('file',new Blob([await readFile(`fixtures/plans/${filename}`)],{type:filename.endsWith('.jpg')?'image/jpeg':'image/png'}),filename);form.append('baseRevision','1');
  const {drawing}=UploadDrawingResponseSchema.parse(await(await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form})).json());
  const started=await call(app.url,'POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page:1});
  return settled(started.body.sessionId as string);
}
test('five automatic questions persist through replay, answers and revisions without another Vision call',async()=>{
  let s=await create('office-a.png');
  assert.equal(s.questions?.filter(q=>q.automatic).length,5);assert.equal(s.questions?.length,8);
  const replay=await settled(s.session.id);assert.deepEqual(replay.questions,s.questions);
  const q=s.questions![0],calls=vision.calls;
  const invalid=await call(app.url,'POST',`/api/analyses/${s.session.id}/questions/${q.id}`,{baseRevision:2,action:'ANSWER',elementIds:[s.elements.find(e=>e.type==='CORRIDOR')!.id]});assert.equal(invalid.status,422);
  const answered=await call(app.url,'POST',`/api/analyses/${s.session.id}/questions/${q.id}`,{baseRevision:2,action:'ANSWER',elementIds:q.candidateIds});assert.equal(answered.status,200);
  s=await settled(latestSessionForProject(app.ctx.db,s.session.projectId)!.id);
  assert.ok(s.questions!.filter(q=>q.automatic).length<=5);assert.equal(vision.calls,calls);
  assert.equal(s.questions?.find(task=>task.id===q.id)?.status,'ANSWERED');
  const stale=await call(app.url,'POST',`/api/analyses/${replay.session.id}/questions/${q.id}`,{baseRevision:2,action:'SKIP'});assert.equal(stale.status,409);
  const pending=s.questions!.find(q=>q.automatic&&q.status==='PENDING');
  if(pending){await call(app.url,'POST',`/api/analyses/${s.session.id}/questions/${pending.id}`,{baseRevision:s.session.projectRevision,action:'DISMISS'});s=await settled(s.session.id);assert.ok(!s.questions?.some(q=>q.automatic&&q.status==='PENDING'));}
});
test('another layout gets its own question round and skipping preserves findings',async()=>{
  let s=await create('office-b.jpg');const q=s.questions!.find(q=>q.automatic)!;
  const count=s.findings.length;
  assert.equal((await call(app.url,'POST',`/api/analyses/${s.session.id}/questions/${q.id}`,{baseRevision:2,action:'SKIP'})).status,200);
  s=await settled(s.session.id);assert.equal(s.questions?.find(t=>t.id===q.id)?.status,'SKIPPED');assert.equal(s.findings.length,count);assert.ok(s.questions!.filter(q=>q.automatic).length<=5);
});
