import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createSourceReader} from '../../src/geometry/source';
import type {PreparedPage} from '../../src/geometry';
const page={sourceWidth:4000,sourceHeight:3000,page:1} as PreparedPage;
test('detail crops come from original pixels instead of the 2048px viewer raster',async()=>{
  const original=await sharp({create:{width:4000,height:3000,channels:3,background:'#fff'}}).composite([{input:Buffer.from('<svg width="4000" height="3000"><rect x="3000" y="2000" width="200" height="100" fill="black"/></svg>')}]).png().toBuffer();
  const r=await createSourceReader(original,'image/png',page).region({kind:'BBOX',x:3000,y:2000,width:200,height:100});
  assert.equal(r.width,400);assert.equal(r.height,200);
  const data=await sharp(r.image).raw().toBuffer();assert.ok(data[0]<5);
  await assert.rejects(createSourceReader(original,'image/png',page).region({kind:'BBOX',x:-1,y:0,width:5,height:5}),/INVALID_REGION/);
});
test('PDF text and crops use the canonical cropped/rotated source frame',async()=>{
  const bytes=await readFile('fixtures/plans/offices.pdf'),p={...page,sourceWidth:1600,sourceHeight:1200,page:2};
  const reader=createSourceReader(bytes,'application/pdf',p);
  const text=await reader.text();assert.ok(text.some(t=>t.text.includes('office-b')));
  assert.ok(text.every(t=>t.geometry.kind==='POLYGON'&&t.geometry.points.every(p=>p.x>=0&&p.y>=0&&p.x<=1600&&p.y<=1200)));
  const r=await reader.region({kind:'BBOX',x:0,y:0,width:800,height:600});
  assert.equal((await sharp(r.image).metadata()).width,r.width);
});
