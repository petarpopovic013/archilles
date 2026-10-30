import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ElementTypeSchema } from '../domain/common';
import { ArchitecturalElementSchema, EvidenceSchema, GeometrySchema, MeasurementSchema } from '../domain/project';
import type { GeometryExtraction } from './types';
const FixtureSchema=z.strictObject({name:z.string(),width:z.number().positive(),height:z.number().positive(),provenance:z.string().min(1),elements:z.array(z.strictObject({type:ElementTypeSchema,label:z.string(),geometry:GeometrySchema,width:z.number().positive().optional()}))});
/** Explicit demo path. Caller supplies fixture JSON, never a filename-based switch. */
export function loadConfirmedFixture(data:unknown,context:{projectId:string;drawingId:string;floorId:string;revision:number;at:string}):GeometryExtraction {
 const fixture=FixtureSchema.parse(data),result:GeometryExtraction={elements:[],measurements:[],evidence:[],missingInputs:[],warnings:[`DISCLOSED SYNTHETIC FIXTURE: ${fixture.provenance}`],usage:{model:'none:confirmed-fixture',inputTokens:0,outputTokens:0,cacheHit:false}};
 for(const item of fixture.elements){
  const evidence=EvidenceSchema.parse({id:randomUUID(),projectId:context.projectId,revision:context.revision,drawingId:context.drawingId,page:1,source:'USER',text:fixture.provenance,geometry:item.geometry,capturedAt:context.at});
  const element=ArchitecturalElementSchema.parse({id:randomUUID(),projectId:context.projectId,floorId:context.floorId,revision:context.revision,type:item.type,label:item.label,geometry:item.geometry,relationIds:[],evidenceIds:[evidence.id],extraction:'USER_CREATED'});
  result.elements.push(element);result.evidence.push(evidence);
  if(item.width!==undefined) result.measurements.push(MeasurementSchema.parse({id:randomUUID(),projectId:context.projectId,elementId:element.id,revision:context.revision,metric:'CLEAR_WIDTH_M',value:item.width,unit:'m',source:'USER_ENTERED',verification:'USER_CONFIRMED',evidenceIds:[evidence.id],recordedBy:'synthetic-fixture-author',recordedAt:context.at}));
  else if(item.type==='ENTRANCE') result.missingInputs.push({elementId:element.id,metric:'CLEAR_WIDTH_M',reason:'Synthetic entrance dimension intentionally unspecified.'});
 }
 return result;
}
