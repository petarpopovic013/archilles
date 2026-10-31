import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import { AnalysisSnapshotSchema, GeometryPageResponseSchema, ProjectSchema, UploadDrawingResponseSchema } from '../../src/domain';
import { createNodePageRenderer } from '../../src/geometry/node-renderer';
import { createDrawingVisionRunner } from '../../src/vision/pipeline';
import { startRuntime, type RuntimeApp } from '../../runtime/app';
import { insertObservations } from '../../runtime/db/repo';
import { fakeInference, fakeRegistry } from './fakes';
import { call, removeDataDir, testConfig, waitFor } from './helpers';

const config=testConfig({visionModel:'claude-sonnet-4-6'});
let app:RuntimeApp,providerCalls=0;
const box={kind:'BBOX',x:80,y:80,width:160,height:160};
const client={messages:{create:async(body:{messages:Array<{content:Array<{type:string;text?:string}>}>})=>{
  providerCalls++;
  const content=body.messages[0].content,text=content[0].text!;
  const output=text.startsWith('Read this floor plan')
    ? {rooms:[{ref:'room',label:'1',geometry:box,interiorPoint:{x:120,y:120},labels:[]}],openings:[],features:[],annotations:[],warnings:[],legend:[{id:'wall',kind:'WALL',description:'Filled wall',geometry:box,uncertain:false}],unitNote:'No explicit units.'}
    : text.startsWith('Read the two detail')
      ? {images:content.filter(c=>c.type==='text'&&c.text?.startsWith('Image ')).map(c=>({imageId:/^Image (.*?): FULL/.exec(c.text!)![1],elements:[],annotations:[],warnings:[]}))}
      : {elements:[],annotations:[],warnings:[]};
  return {stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:JSON.stringify(output)}]};
}}} as unknown as Anthropic;

before(async()=>{app=await startRuntime({config,registry:fakeRegistry([]),inferenceRunner:fakeInference(),geometry:{renderer:createNodePageRenderer(),vision:createDrawingVisionRunner(client,config.visionModel)}});});
after(async()=>{await app?.close();removeDataDir(config);});
async function settled(id:string){return waitFor(async()=>{
  const snapshot=AnalysisSnapshotSchema.parse((await call(app.url,'GET',`/api/analyses/${id}`)).body);
  return snapshot.session.status==='RUNNING'?undefined:snapshot;
});}

for(const [filename,mime] of [['office-a.png','image/png'],['office-b.jpg','image/jpeg']] as const){
  test(`${filename}: upload pauses, confirmation reads all regions, corrections reuse geometry`,async()=>{
    const project=ProjectSchema.parse((await call(app.url,'POST','/api/projects',{name:`Checkpoint ${filename}`})).body);
    const form=new FormData();form.append('file',new Blob([await readFile(`fixtures/plans/${filename}`)],{type:mime}),filename);form.append('baseRevision','1');
    const {drawing}=UploadDrawingResponseSchema.parse(await(await fetch(`${app.url}/api/projects/${project.id}/drawings`,{method:'POST',body:form})).json());
    const before=providerCalls;
    const start=await call(app.url,'POST',`/api/projects/${project.id}/analyses`,{projectRevision:2,drawingId:drawing.id,page:1});
    const overview=await settled(start.body.sessionId as string);
    assert.equal(overview.geometry?.stage,'AWAITING_CONFIRMATION');
    assert.equal(providerCalls-before,1);
    assert.equal(overview.elements.length,0);
    assert.deepEqual(overview.questions,[],'findings questions wait for detailed geometry');

    // A previously saved human object must not make the checkpoint look like a
    // complete extraction or prevent newly read suggestions from being persisted.
    const floorId=app.ctx.db.prepare('SELECT id FROM floors WHERE drawing_id=?').pluck().get(drawing.id) as string;
    const preservedId=randomUUID();
    insertObservations(app.ctx.db,{elements:[{id:preservedId,projectId:project.id,floorId,revision:2,type:'STAIR',geometry:{kind:'BBOX',x:700,y:450,width:30,height:30},relationIds:[],extraction:'USER_CREATED',geometryVerification:'USER_CONFIRMED',evidenceIds:[]}],measurements:[],evidence:[]});

    const response=await call(app.url,'PATCH',`/api/drawings/${drawing.id}/pages/1/geometry`,{baseRevision:2,unit:'cm',unitSource:'USER',conventionsSource:'USER',legendConfirmed:true,confirmedLegendIds:['wall']});
    assert.equal(response.status,200);
    const result=await settled(GeometryPageResponseSchema.parse(response.body).sessionId!);
    assert.notEqual(result.geometry?.stage,'AWAITING_CONFIRMATION');
    assert.equal(result.geometry?.calls,providerCalls-before,'overview is cached across revisions');
    assert.ok(providerCalls-before<=4);
    assert.ok(result.geometry?.regions.length===4&&result.geometry.regions.every(r=>r.processed));
    assert.ok(result.elements.some(e=>e.id===preservedId));
    assert.ok(result.elements.some(e=>e.type==='ROOM'),'detail continuation persists fresh geometry alongside human geometry');
    assert.ok(result.measurements.every(m=>m.verification==='UNVERIFIED'));

    const completedCalls=providerCalls;
    const correction=await call(app.url,'PATCH',`/api/drawings/${drawing.id}/pages/1/geometry`,{baseRevision:3,unit:'mm',legendConfirmed:true,confirmedLegendIds:['wall']});
    assert.equal(correction.status,200);
    const corrected=await settled(GeometryPageResponseSchema.parse(correction.body).sessionId!);
    assert.equal(providerCalls,completedCalls,'unit corrections never buy another extraction');
    assert.deepEqual(corrected.elements.map(e=>e.id),result.elements.map(e=>e.id));
    assert.equal((await settled(overview.session.id)).geometry?.stage,'AWAITING_CONFIRMATION','historical checkpoint is preserved');
  });
}
