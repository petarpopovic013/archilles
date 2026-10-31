import assert from 'node:assert/strict';
import test from 'node:test';
import {wallMask} from '../../src/geometry/refine';
import {reconstructRooms} from '../../src/geometry/reconstruct';
import {simplePolygon,iou,area} from '../../src/geometry/topology';
import type {VisionOutput} from '../../src/vision/schema';
import type {Geometry} from '../../src/domain';
const box=(x:number,y:number,width:number,height:number):Geometry=>({kind:'BBOX',x,y,width,height});
const e=(ref:string,type:'ROOM'|'DOOR',geometry:Geometry)=>({ref,type,geometry,measurements:[]});
function raster(){const width=300,height=220,data=new Uint8Array(width*height).fill(255);const fill=(x:number,y:number,w:number,h:number)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)data[j*width+i]=0;};
  fill(10,10,280,8);fill(10,202,280,8);fill(10,10,8,200);fill(282,10,8,200);fill(145,10,8,80);fill(145,130,8,80);
  // Thin furniture lines must not form the room boundary.
  fill(35,40,60,1);fill(35,40,1,40);return {data,width,height};
}
test('reconstruction follows wall faces and seals an observed doorway only for room contours',()=>{
  const output:VisionOutput={elements:[e('a','ROOM',box(22,22,118,176)),e('b','ROOM',box(159,22,118,176)),e('door','DOOR',box(145,90,8,40))],warnings:[]};
  const result=reconstructRooms(output,raster());
  const a=result.output.elements.find(e=>e.ref==='a')!,b=result.output.elements.find(e=>e.ref==='b')!;
  assert.ok(iou(a.geometry,box(18,18,127,184))>.98);
  assert.ok(iou(b.geometry,box(153,18,129,184))>.98);
  assert.ok(a.geometry.kind==='POLYGON'&&simplePolygon(a.geometry));
  assert.deepEqual(result.connections.find(c=>c.ref==='door')?.rooms,['a','b']);
  assert.ok(!result.issues.some(i=>i.code==='ROOM_OVERLAP'));
});
test('missing opening evidence leaves an open connection visible as uncertainty',()=>{
  const result=reconstructRooms({elements:[e('a','ROOM',box(22,22,118,176)),e('b','ROOM',box(159,22,118,176))],warnings:[]},raster());
  assert.ok(result.issues.some(i=>i.code==='WALL_GAP_REVIEW'));
  assert.ok(result.output.elements.every(e=>e.type!=='DOOR'),'segmentation never invents a door');
});
test('topology refuses self intersections, touching non-adjacent edges and degenerate polygons',()=>{
  assert.equal(simplePolygon({kind:'POLYGON',points:[{x:0,y:0},{x:10,y:10},{x:0,y:10},{x:10,y:0}]}),false);
  assert.equal(simplePolygon(box(0,0,10,10)),true);
  const l:Geometry={kind:'POLYGON',points:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:10,y:10},{x:10,y:20},{x:0,y:20}]};
  assert.equal(simplePolygon(l),true);assert.equal(area(l),300);assert.ok(iou(l,box(0,0,20,20))<.8);
});

test('an interior seed inside furniture does not shrink the room to the furniture footprint',()=>{
  const r=raster();for(let y=60;y<110;y++)for(let x=35;x<85;x++)if(y<64||y>=106||x<39||x>=81)r.data[y*r.width+x]=0;
  const a={...e('a','ROOM',box(22,22,118,176)),interiorPoint:{x:55,y:80}};
  const result=reconstructRooms({elements:[a,e('door','DOOR',box(145,90,8,40))],warnings:[]},r);
  assert.ok(iou(result.output.elements.find(e=>e.ref==='a')!.geometry,box(18,18,127,184))>.98);
  assert.equal(result.output.elements.filter(e=>e.type==='ROOM').length,2,'the other floor may be discovered, but a furniture cavity is not another room');
  assert.ok(result.issues.some(i=>i.code==='INTERIOR_ENCLOSURE'));
});
test('crossed suggested room contours are not persisted as crossed polygons',()=>{
  const result=reconstructRooms({elements:[e('bad','ROOM',{kind:'POLYGON',points:[{x:20,y:20},{x:130,y:190},{x:20,y:190},{x:130,y:20}]})],warnings:[]},raster());
  assert.ok(result.issues.some(i=>i.code==='INVALID_POLYGON'));assert.ok(result.output.elements.every(e=>simplePolygon(e.geometry)));
});

test('wall evidence recovers rooms omitted by Vision without inventing names or dimensions',()=>{
  const result=reconstructRooms({elements:[e('door','DOOR',box(145,90,8,40))],warnings:[]},raster());
  const rooms=result.output.elements.filter(e=>e.type==='ROOM');assert.equal(rooms.length,2);assert.ok(rooms.every(e=>!e.label&&!e.measurements.length));
  assert.ok(rooms.some(e=>iou(e.geometry,box(18,18,127,184))>.98));assert.ok(result.issues.some(i=>i.code==='ROOM_UNLABELLED'));
});

test('a single dimension line joining walls does not split the floor, while paired anchored window strokes survive',()=>{
  const w=1000,h=600,data=new Uint8Array(w*h).fill(255),fill=(x:number,y:number,ww:number,hh:number)=>{for(let j=y;j<y+hh;j++)for(let i=x;i<x+ww;i++)data[j*w+i]=0;};
  fill(10,10,980,20);fill(10,570,980,20);fill(10,10,20,190);fill(10,350,20,240);fill(10,200,1,150);fill(29,200,1,150);fill(300,10,1,580);
  const mask=wallMask({width:w,height:h,data});assert.equal(mask[300*w+300],0);assert.equal(mask[250*w+10],1);assert.equal(mask[250*w+29],1);
});
