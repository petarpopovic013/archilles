import assert from 'node:assert/strict';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import {createDrawingVisionRunner,mergeObservations,normalizeOpeningKinds} from '../../src/vision/pipeline';
import type {VisionContext} from '../../src/vision/pipeline-types';
import {plainRaster} from './raster';
import type {VisionOutput} from '../../src/vision/schema';
const box={kind:'BBOX' as const,x:80,y:80,width:100,height:100};
function setup(){
  let calls=0;const cache=new Map<string,unknown>();
  const client={messages:{create:async(body:{messages:Array<{content:Array<{type:string;text?:string}>}>})=>{
    calls++;const text=body.messages[0].content[0].text!;
    let output:unknown;
    if(text.startsWith('Read this floor plan'))output={rooms:[{ref:'r',label:'1',geometry:box,interiorPoint:{x:120,y:120},labels:[]}],openings:[],features:[],warnings:[],legend:[{id:'wall',kind:'WALL',description:'Thick filled wall',geometry:box,uncertain:false}],unitNote:'No explicit units.'};
    else if(text.startsWith('Read the two detail'))output={images:body.messages[0].content.filter(c=>c.type==='text'&&c.text?.startsWith('Image ')).map(c=>({imageId:/^Image (.*?): FULL/.exec(c.text!)![1],elements:[],warnings:[]}))};
    else output={elements:[],warnings:[]};
    return {stop_reason:'end_turn',usage:{input_tokens:100,output_tokens:50},content:[{type:'text',text:JSON.stringify(output)}]};
  }}} as unknown as Anthropic;
  const context:VisionContext={settings:{unit:null,legendConfirmed:false,confirmedLegendIds:[]},sourceWidth:400,sourceHeight:300,cache:{async get(k){return cache.get(k);},async set(k,v){cache.set(k,v);}},current:()=>true,onStage:()=>{},readRegion:async geometry=>({id:JSON.stringify(geometry),geometry,width:200,height:150,image:await plainRaster(200,150)})};
  return {client,context,calls:()=>calls};
}
test('overview pauses for confirmation; continuation reuses it and reads every detail region',async()=>{
  const f=setup(),runner=createDrawingVisionRunner(f.client,'claude-sonnet-4-6');
  const image=await plainRaster(400,300);
  const first=await runner.run(image,400,300,f.context);
  assert.equal(first.report?.stage,'AWAITING_CONFIRMATION');assert.equal(f.calls(),1);
  assert.deepEqual((first.output as VisionOutput).elements,[]);
  f.context.settings.legendConfirmed=true;f.context.priorUsage=first.report;
  const second=await runner.run(image,400,300,f.context);
  assert.equal(second.report?.regions.length,4);assert.ok(second.report?.regions.every(r=>r.processed));
  assert.ok(f.calls()<=4);assert.equal(second.report?.calls,f.calls());
  const before=f.calls();await runner.run(image,400,300,f.context);assert.equal(f.calls(),before,'stage cache avoids another provider call');
});
test('stale revisions and page budget prevent provider access',async()=>{
  const f=setup(),runner=createDrawingVisionRunner(f.client,'claude-sonnet-4-6',{maxCostUsd:.000001});
  await assert.rejects(runner.run(await plainRaster(400,300),400,300,f.context),/GEOMETRY_PAGE_BUDGET/);assert.equal(f.calls(),0);
  f.context.current=()=>false;
  await assert.rejects(createDrawingVisionRunner(f.client,'claude-sonnet-4-6').run(await plainRaster(400,300),400,300,f.context),/REVISION_SUPERSEDED/);assert.equal(f.calls(),0);
});
test('a partially billed invalid response retains usage without a blind schema retry',async()=>{
  const f=setup();let calls=0;
  const client={messages:{create:async()=>{calls++;return {stop_reason:'end_turn',usage:{input_tokens:123,output_tokens:45},content:[{type:'text',text:'{invalid'}]};}}} as unknown as Anthropic;
  await assert.rejects(createDrawingVisionRunner(client,'claude-sonnet-4-6').run(await plainRaster(400,300),400,300,f.context),error=>{const e=error as {usage?:{inputTokens:number;outputTokens:number}};return e.usage?.inputTokens===123&&e.usage?.outputTokens===45;});assert.equal(calls,1);
});
test('crops cannot turn furniture or partial rooms into extra canonical spaces',()=>{
  const base:VisionOutput={elements:[{ref:'room',type:'ROOM',geometry:box,measurements:[]}],warnings:[]};
  const result=mergeObservations(base,{elements:[{ref:'partial',type:'ROOM',geometry:box,measurements:[]},{ref:'dim',type:'UNKNOWN',label:'80/200',geometry:box,measurements:[]}],warnings:[]});
  assert.equal(result.elements.length,1);assert.equal(result.elements[0].labels?.[0].text,'80/200');
});

test('a transient retry is shared across overview and confirmed continuation',async()=>{
  const f=setup(),original=f.client.messages.create.bind(f.client.messages);let attempts=0,failDetails=false;
  const client={messages:{create:async(...args:Parameters<typeof original>)=>{attempts++;if(attempts===1||failDetails)throw {status:503};return original(...args);}}} as unknown as Anthropic;
  const runner=createDrawingVisionRunner(client,'claude-sonnet-4-6'),image=await plainRaster(400,300);
  const first=await runner.run(image,400,300,f.context);assert.equal(first.report?.calls,2);assert.equal(first.report?.logicalCalls,1);
  f.context.priorUsage=first.report;f.context.settings.legendConfirmed=true;failDetails=true;
  const second=await runner.run(image,400,300,f.context);
  assert.equal(attempts,3,'the retry consumed before confirmation is not reset afterward');assert.equal(second.report?.stage,'PARTIAL');assert.ok(second.estimatedCostUsd!>0,'opaque failed requests still consume conservative cost');
});

test('door/window conflicts stay reviewable instead of letting the last crop silently overwrite meaning',()=>{
  const base:VisionOutput={elements:[{ref:'opening',type:'OPENING',openingKind:'DOOR',geometry:box,labels:[{text:'80/200',geometry:box}],measurements:[]}],warnings:[]};
  assert.equal(normalizeOpeningKinds(base).elements[0].type,'DOOR');
  const detail:VisionOutput={elements:[{ref:'opening',type:'OPENING',openingKind:'WINDOW',geometry:box,measurements:[]}],warnings:[]};
  const result=mergeObservations(base,detail),opening=result.elements[0];assert.equal(result.elements.length,1);assert.equal(opening.type,'OPENING');assert.equal(opening.openingKind,'UNKNOWN');assert.equal(opening.openingConflict,true);assert.equal(opening.labels?.[0].text,'80/200');
  assert.equal(mergeObservations(result,base).elements[0].openingConflict,true,'a later unverified vote does not clear the conflict');
});

test('one malformed crop annotation is withheld while the remaining regions finish',async()=>{
  const f=setup(),original=f.client.messages.create.bind(f.client.messages);
  const client={messages:{create:async(...args:Parameters<typeof original>)=>{const response=await original(...args) as Anthropic.Messages.Message;const data=JSON.parse((response.content[0] as {text:string}).text);if(data.images)data.images[0].elements=[{ref:'badlabel',type:'DOOR',geometry:box,measurements:[],labels:[{text:'80',geometry:{kind:'POLYGON',points:[{x:1,y:1},{x:1,y:1},{x:1,y:1}]}}]}];return {...response,content:[{type:'text',text:JSON.stringify(data)}]};}}} as unknown as Anthropic;
  f.context.settings.legendConfirmed=true;
  const result=await createDrawingVisionRunner(client,'claude-sonnet-4-6').run(await plainRaster(400,300),400,300,f.context);
  assert.ok(result.report?.regions.every(r=>r.processed));assert.ok(!result.report?.issues.some(i=>i.code==='VISION_SCHEMA_INVALID'));assert.ok(result.report?.warnings.some(w=>w.includes('malformed annotation')));assert.equal(result.report?.stage,'PARTIAL');
});
