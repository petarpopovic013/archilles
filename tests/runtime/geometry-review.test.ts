import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {before,after,test} from 'node:test';
import {startRuntime,type RuntimeApp} from '../../runtime/app';
import {AnalysisSnapshotSchema,GeometryPageResponseSchema,ProjectSchema,UploadDrawingResponseSchema,ElementUpdateResponseSchema} from '../../src/domain';
import {createNodePageRenderer} from '../../src/geometry/node-renderer';
import {fakeRegistry,fakeInference,fakeVision,corridorPlan} from './fakes';
import {testConfig,call,waitFor,removeDataDir} from './helpers';
import {latestSessionForProject} from '../../runtime/db/repo';
const config=testConfig(),vision=fakeVision(()=>corridorPlan(1.05));let app:RuntimeApp;
before(async()=>{app=await startRuntime({config,registry:fakeRegistry([]),inferenceRunner:fakeInference(),geometry:{renderer:createNodePageRenderer(),vision}});});
after(async()=>{await app.close();removeDataDir(config);});
async function settled(id:string){return waitFor(async()=>{const r=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${id}`)).body);return r.session.status==='RUNNING'?undefined:r;});}
test('geometry edits and explicit reread preserve confirmed versions and historical suggestions',async()=>{
  const project=ProjectSchema.parse((await call(app.url,'POST','/api/projects',{name:'Geometry history'})).body);
  const form=new FormData();form.append('file',new Blob([await readFile('fixtures/plans/office-a.png')],{type:'image/png'}),'office-a.png');form.append('baseRevision','1');
  const {drawing}=UploadDrawingResponseSchema.parse(await(await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form})).json());
  const start=await call(app.url,'POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page:1});
  const initial=await settled(start.body.sessionId as string),door=initial.elements.find(e=>e.type==='DOOR')!;
  const changed={kind:'POLYGON' as const,points:[{x:370,y:225},{x:430,y:225},{x:430,y:250},{x:370,y:250}]};
  const corrected=await call(app.url,'PATCH',`/api/elements/${door.id}`,{baseRevision:2,geometry:changed});
  const correction=ElementUpdateResponseSchema.parse(corrected.body);assert.deepEqual(correction.element.geometry,changed);assert.equal(correction.element.extraction,'USER_CONFIRMED');
  await settled(latestSessionForProject(app.ctx.db,project.id)!.id);
  const repeat=await call(app.url,'POST',`/api/drawings/${drawing.id}/pages/1/geometry`,{baseRevision:3});
  assert.equal(repeat.status,200);const refreshed=await settled(GeometryPageResponseSchema.parse(repeat.body).sessionId!);
  assert.ok(refreshed.elements.some(e=>e.id===door.id&&e.extraction==='USER_CONFIRMED'));
  const oldCorridor=initial.elements.find(e=>e.type==='CORRIDOR')!;
  assert.ok(!refreshed.elements.some(e=>e.id===oldCorridor.id),'old AI suggestions are retired only from newer revisions');
  const history=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${initial.session.id}`)).body);
  assert.ok(history.elements.some(e=>e.id===oldCorridor.id));assert.deepEqual(history.elements.find(e=>e.id===door.id)?.geometry,door.geometry);
  assert.equal(vision.calls,2,'explicit refresh performs one new extraction');
  const invalid=await call(app.url,'PATCH',`/api/elements/${door.id}`,{baseRevision:4,geometry:{kind:'POLYGON',points:[{x:0,y:0},{x:20,y:20},{x:0,y:20},{x:20,y:0}]}});
  assert.equal(invalid.status,422);
});
test('drawing settings enforce revisions and in-bounds two-point calibration without confirming measurements',async()=>{
  const projectId=app.ctx.db.prepare('SELECT id FROM projects LIMIT 1').pluck().get() as string,drawingId=app.ctx.db.prepare('SELECT id FROM drawings LIMIT 1').pluck().get() as string;
  const current=ProjectSchema.parse((await call(app.url,'GET',`/api/projects/${projectId}`)).body);
  const bad=await call(app.url,'PATCH',`/api/drawings/${drawingId}/pages/1/geometry`,{baseRevision:current.revision,unit:'cm',legendConfirmed:true,confirmedLegendIds:[],calibration:{points:[{x:0,y:0},{x:9000,y:0}],lengthM:1}});assert.equal(bad.status,422);
  const valid=await call(app.url,'PATCH',`/api/drawings/${drawingId}/pages/1/geometry`,{baseRevision:current.revision,unit:'cm',legendConfirmed:true,confirmedLegendIds:[],calibration:{points:[{x:50,y:50},{x:150,y:50}],lengthM:2}});assert.equal(valid.status,200);
  await settled(GeometryPageResponseSchema.parse(valid.body).sessionId!);
  const verified=app.ctx.db.prepare("SELECT COUNT(*) FROM measurements WHERE json_extract(data,'$.verification')!='UNVERIFIED'").pluck().get();assert.equal(verified,0,'units and calibration do not approve measured values');
  const stale=await call(app.url,'PATCH',`/api/drawings/${drawingId}/pages/1/geometry`,{baseRevision:current.revision,unit:'m',legendConfirmed:true,confirmedLegendIds:[]});assert.equal(stale.status,409);
});

test('manually drawing a missing element validates ownership and topology without another Vision call',async()=>{
  const projectId=app.ctx.db.prepare('SELECT id FROM projects LIMIT 1').pluck().get() as string,drawingId=app.ctx.db.prepare('SELECT id FROM drawings LIMIT 1').pluck().get() as string;
  const current=ProjectSchema.parse((await call(app.url,'GET',`/api/projects/${projectId}`)).body),calls=vision.calls;
  const request={baseRevision:current.revision,drawingId,page:1,type:'OPENING',label:'Manually reviewed window',geometry:{kind:'BBOX',x:50,y:50,width:30,height:10}};
  const bad=await call(app.url,'POST',`/api/projects/${projectId}/elements`,{...request,geometry:{...request.geometry,x:-1}});assert.equal(bad.status,422);
  const result=ElementUpdateResponseSchema.parse((await call(app.url,'POST',`/api/projects/${projectId}/elements`,request)).body);
  assert.equal(result.element.extraction,'USER_CREATED');assert.equal(result.element.geometryVerification,'USER_CONFIRMED');assert.equal(result.element.subtype,undefined);
  await settled(latestSessionForProject(app.ctx.db,projectId)!.id);assert.equal(vision.calls,calls);
  const invalidPage=await call(app.url,'POST',`/api/drawings/${drawingId}/pages/NaN/geometry`,{baseRevision:result.revision.revision});assert.equal(invalidPage.status,404);
});

test('removing an incorrect object keeps old revisions and does not call Vision again',async()=>{
  const projectId=app.ctx.db.prepare('SELECT id FROM projects LIMIT 1').pluck().get() as string,current=ProjectSchema.parse((await call(app.url,'GET',`/api/projects/${projectId}`)).body);
  const before=await settled(latestSessionForProject(app.ctx.db,projectId)!.id),target=before.elements.find(e=>e.extraction==='USER_CREATED')!,calls=vision.calls;
  const removed=await call(app.url,'DELETE',`/api/elements/${target.id}`,{baseRevision:current.revision});assert.equal(removed.status,200);
  const after=await settled(latestSessionForProject(app.ctx.db,projectId)!.id);assert.ok(!after.elements.some(e=>e.id===target.id));assert.equal(vision.calls,calls);
  const history=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${before.session.id}`)).body);assert.ok(history.elements.some(e=>e.id===target.id));
  const late=await call(app.url,'PATCH',`/api/elements/${target.id}`,{baseRevision:after.session.projectRevision,type:'DOOR'});assert.equal(late.status,404);
});

test('retiring the final suggestion does not silently buy another extraction',async()=>{
  const project=ProjectSchema.parse((await call(app.url,'POST','/api/projects',{name:'Remove entire extraction'})).body);
  const form=new FormData();form.append('file',new Blob([await readFile('fixtures/plans/office-b.jpg')],{type:'image/jpeg'}),'office-b.jpg');form.append('baseRevision','1');
  const {drawing}=UploadDrawingResponseSchema.parse(await(await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form})).json());
  const start=await call(app.url,'POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page:1});let latest=await settled(start.body.sessionId as string);const calls=vision.calls;
  for(const element of latest.elements){const result=await call(app.url,'DELETE',`/api/elements/${element.id}`,{baseRevision:latest.session.projectRevision});assert.equal(result.status,200);latest=await settled(latestSessionForProject(app.ctx.db,project.id)!.id);}
  assert.equal(latest.elements.length,0);assert.equal(vision.calls,calls);
});
