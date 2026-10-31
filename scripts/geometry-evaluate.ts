/** Offline comparison of a saved extraction against explicitly labelled reference geometry. */
import {readFile,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {GeometrySchema,ArchitecturalElementSchema,GeometryReportSchema} from '../src/domain';
import {compareRooms} from '../src/geometry/benchmark';
const args=process.argv.slice(2);
async function main(){if(args.length<2)throw new Error('Usage: geometry-evaluate.ts observations.json reference.json [output.json]');const raw=JSON.parse(await readFile(args[0],'utf8'));const result=z.object({result:z.object({elements:z.array(ArchitecturalElementSchema),geometry:GeometryReportSchema})}).parse(raw).result;const reference=z.object({provenance:z.string(),rooms:z.array(z.object({label:z.string(),geometry:GeometrySchema}))}).parse(JSON.parse(await readFile(args[1],'utf8')));const output={provenance:reference.provenance,referenceScope:'Only explicitly annotated rooms; no full-plan precision/recall is inferred.',rooms:compareRooms(reference.rooms,result.elements,result.geometry.sourceWidth,result.geometry.sourceHeight)};if(args[2])await writeFile(args[2],JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify(output));}
main().catch(e=>{console.error(e instanceof Error?e.message:'EVALUATION_FAILED');process.exitCode=1;});
