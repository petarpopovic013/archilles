import {zodOutputFormat} from '@anthropic-ai/sdk/helpers/zod';
import {z} from 'zod';
import {PointSchema} from '../domain/project';
import {ElementTypeSchema} from '../domain/common';

// Deliberately compact provider protocol: fixed keys, one geometry representation, no nullable
// branches. Unknown strings are empty, unknown points (-1,-1), and unknown spans empty arrays.
// The richer canonical schema is still enforced AFTER decoding this protocol.
const geometry=z.strictObject({kind:z.literal('POLYGON'),points:z.array(PointSchema)});
const label=z.strictObject({text:z.string(),geometry,kind:z.enum(['DIMENSION','NOMINAL_OPENING','ROOM_LABEL','OPENING_LABEL','LEVEL','OTHER']),direction:z.enum(['HORIZONTAL','VERTICAL','ROTATED','UNKNOWN']),span:z.array(PointSchema),association:z.enum(['SUGGESTED','UNRESOLVED'])});
const labels=z.array(label),warnings=z.array(z.string());
const element=z.strictObject({ref:z.string(),type:ElementTypeSchema,label:z.string(),subtype:z.string(),geometry,interiorPoint:PointSchema,openingKind:z.enum(['DOOR','WINDOW','UNKNOWN']),labels});
const output=z.strictObject({elements:z.array(element),annotations:labels,warnings});
const overview=z.strictObject({rooms:z.array(z.strictObject({ref:z.string(),label:z.string(),geometry,interiorPoint:PointSchema,labels})),openings:z.array(element),features:z.array(element),annotations:labels,warnings,legend:z.array(z.strictObject({id:z.string(),kind:z.enum(['WALL','DOOR','WINDOW','DIMENSION','LABEL','FURNITURE','OTHER']),description:z.string(),geometry,uncertain:z.boolean()})),unitNote:z.string()});
const batch=z.strictObject({images:z.array(output.extend({imageId:z.string()}))});

export function visionOutputFormat(schema:z.ZodType) {
  const shape=(schema as z.ZodObject).shape;
  return zodOutputFormat(shape&&'rooms' in shape?overview:shape&&'images' in shape?batch:output);
}
/** Normalizes wire sentinels without weakening required canonical geometry validation. */
export function omitUnknownWireValues(value:unknown):unknown {
  if(Array.isArray(value))return value.map(omitUnknownWireValues);
  if(!value||typeof value!=='object')return value;
  const object=Object.fromEntries(Object.entries(value).filter(([k,v])=>v!==null&&!(['label','subtype'].includes(k)&&v==='')&&!(k==='span'&&Array.isArray(v)&&v.length===0)).map(([k,v])=>[k,omitUnknownWireValues(v)]));
  if(object.interiorPoint&&typeof object.interiorPoint==='object'){
    const p=object.interiorPoint as {x:number;y:number};if(p.x<0||p.y<0)delete object.interiorPoint;
  }
  if('ref' in object&&'type' in object&&'geometry' in object&&!('measurements' in object))object.measurements=[];
  return object;
}
