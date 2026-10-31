import assert from 'node:assert/strict';
import test from 'node:test';
import {z} from 'zod';
import {visionOutputFormat,omitUnknownWireValues} from '../../src/vision/output-format';
import {VisionOutputSchema} from '../../src/vision/schema';
import {providerFailure} from '../../src/vision/provider-errors';

test('fixed provider keys represent unknown optional evidence without inventing values',()=>{
  const schema=z.strictObject({elements:z.array(z.strictObject({label:z.string().optional(),geometry:z.strictObject({x:z.number()})}))});
  const format=visionOutputFormat(VisionOutputSchema);
  const walk=(value:unknown)=>{if(Array.isArray(value)){value.forEach(walk);return;}if(!value||typeof value!=='object')return;const object=value as Record<string,unknown>;if(object.type==='object')assert.deepEqual(new Set(object.required as string[]),new Set(Object.keys(object.properties as object)));Object.values(object).forEach(walk);};
  walk(format.schema);assert.deepEqual(schema.parse(omitUnknownWireValues({elements:[{label:null,geometry:{x:0}}]})),{elements:[{geometry:{x:0}}]});
  assert.throws(()=>schema.parse(omitUnknownWireValues({elements:[{label:null,geometry:{x:null}}]})),'unknown required geometry still fails');
});
test('nullable Vision wire fields retain explicit zero and validated span evidence',()=>{
  const wire={elements:[{ref:'a',type:'DOOR',label:null,subtype:null,openingKind:'DOOR',geometry:{kind:'BBOX',x:0,y:0,width:10,height:10},interiorPoint:null,labels:[{text:'80',geometry:{kind:'BBOX',x:2,y:2,width:4,height:4},kind:'DIMENSION',direction:'HORIZONTAL',span:[{x:0,y:0},{x:10,y:0}],association:'SUGGESTED'}],measurements:[]}],annotations:null,warnings:[]};
  const output=VisionOutputSchema.parse(omitUnknownWireValues(wire));assert.equal(output.elements[0].geometry.kind==='BBOX'&&output.elements[0].geometry.x,0);assert.equal(output.elements[0].labels?.[0].span?.length,2);
  assert.deepEqual(providerFailure({status:400,error:{error:{message:'The compiled grammar is too large, which would cause performance issues.'}}}),{code:'VISION_SCHEMA_TOO_COMPLEX',retryable:false});
});
