import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  ArchitecturalElementSchema,
  CreateElementRequestSchema,
  EvidenceSchema,
  geometryFitsFloor,
  type ArchitecturalElement,
  type ElementUpdateRequestSchema,
  type ElementsUpdateRequestSchema,
  type GeometryPageRequestSchema,
  type ProjectRevision,
} from "../../src/domain";
import type { RuntimeContext } from "../context";
import { insertElementVersion, insertObservations, floorView, findFloor, findDrawing } from "../db/repo";
import { simplePolygon, intersectionRatio, area } from "../../src/geometry/topology";
import { ApiFailure, revisionConflict } from "../http/errors";
import { createAppEvent } from "../mozaik/app-events";
import { reanalyseAfterRevision } from "./analyses";
import { loadElement } from "./measurements";
import { advanceRevision, getProject } from "./projects";

type ElementUpdateInput = z.output<typeof ElementUpdateRequestSchema>;
type ElementsUpdateInput = z.output<typeof ElementsUpdateRequestSchema>;

/**
 * Human confirmation of an element's type/subtype, e.g. marking a corridor as a passage between
 * fixed furniture. Only a person can make this call: it decides whether a rule applies. The change
 * is a new element version and revision with USER evidence; earlier revisions are untouched.
 */
export async function confirmElement(
  ctx: RuntimeContext,
  elementId: string,
  request: ElementUpdateInput,
): Promise<{ revision: ProjectRevision; element: ArchitecturalElement }> {
  const { element } = loadElement(ctx, elementId);
  const { revision, elements } = await confirmElements(ctx, element.projectId, {
    baseRevision: request.baseRevision,
    updates: [{ elementId, type: request.type, subtype: request.subtype, geometry: request.geometry }],
  });
  return { revision, element: elements[0] };
}

/**
 * Several confirmations as one revision and one follow-up analysis, so applying a category to
 * every door does not create a revision (and a review run) per door.
 */
export async function confirmElements(
  ctx: RuntimeContext,
  projectId: string,
  request: ElementsUpdateInput,
): Promise<{ revision: ProjectRevision; elements: ArchitecturalElement[] }> {
  const project = getProject(ctx.db, projectId);
  if (project.revision !== request.baseRevision) throw revisionConflict(project.revision, request.baseRevision);

  const nextRevision = project.revision + 1;
  const updates = [...new Map(request.updates.map((update) => [update.elementId, update])).values()];
  const changes = updates.map((update) => {
    const { element, floor } = loadElement(ctx, update.elementId, projectId);
    const geometry = update.geometry ?? element.geometry;
    if (update.geometry && (!geometryFitsFloor(geometry, floor.floor) || !simplePolygon(geometry))) throw new ApiFailure(422, "INVALID_GEOMETRY", "Use a simple, non-overlapping contour inside the drawing.");
    const type = update.type ?? element.type;
    if (update.geometry && ["ROOM","CORRIDOR"].includes(type)) {
      const others = floorView(ctx.db, floor.floor.id, project.revision).elements.filter(e=>e.id!==element.id && ["ROOM","CORRIDOR"].includes(e.type));
      if (others.filter(other=>other.geometryVerification==="USER_CONFIRMED").some(other=>{const g=updates.find(u=>u.elementId===other.id)?.geometry??other.geometry;return intersectionRatio(geometry,g) > Math.min(area(geometry),area(g))*.025;})) throw new ApiFailure(422,"GEOMETRY_OVERLAP","Room boundaries must not overlap neighbouring rooms.");
    }
    const subtype = update.subtype === undefined ? (update.geometry && element.extraction === "AI_SUGGESTED" ? undefined : element.subtype) : update.subtype ?? undefined;
    const evidence = EvidenceSchema.parse({
      id: randomUUID(),
      projectId: project.id,
      revision: nextRevision,
      drawingId: floor.floor.drawingId,
      page: floor.floor.page,
      geometry,
      source: "USER",
      text: `User confirmed element as ${type}${subtype ? ` (${subtype})` : ""}.`,
      capturedAt: ctx.now(),
    });
    const updated = ArchitecturalElementSchema.parse({
      ...element,
      geometry,
      geometryVerification: update.geometry ? "USER_CONFIRMED" : element.geometryVerification ?? (element.extraction === "AI_SUGGESTED" ? "UNVERIFIED" : undefined),
      type,
      subtype,
      revision: nextRevision,
      extraction: element.extraction === "USER_CREATED" ? "USER_CREATED" : "USER_CONFIRMED",
      evidenceIds: [...element.evidenceIds, evidence.id],
    });
    return { element, floor, evidence, updated };
  });

  // Classification and confirmation can change any rule's applicability or a count, so all
  // earlier findings are marked stale rather than only these elements'.
  const revision = ctx.db.transaction(() => {
    const result = advanceRevision(ctx, getProject(ctx.db, project.id), request.baseRevision, "GEOMETRY_CORRECTION",
      changes.flatMap(({ element, evidence }) => [element.id, evidence.id]));
    insertObservations(ctx.db, { elements: [], measurements: [], evidence: changes.map(({ evidence }) => evidence) });
    for (const { updated } of changes) insertElementVersion(ctx.db, updated);
    return result.revision;
  })();

  const scope = { projectId: project.id, projectRevision: revision.revision, correlationId: changes[0].evidence.id };
  const floors = new Map(changes.map(({ floor }) => [floor.floor.id, floor.floor]));
  for (const floor of floors.values()) {
    await reanalyseAfterRevision(ctx, scope, floor, (sessionId) => [
      createAppEvent("project.revision.created", { ...scope, sessionId }, { newRevision: revision.revision, changedEntityIds: revision.changedEntityIds }),
    ]);
  }
  return { revision, elements: changes.map(({ updated }) => updated) };
}


/** Human-drawn missing object. No model call and no inferred legal category. */
export async function createElement(ctx: RuntimeContext, projectId: string, request: z.output<typeof CreateElementRequestSchema>) {
  const project=getProject(ctx.db,projectId);
  if(project.revision!==request.baseRevision)throw revisionConflict(project.revision,request.baseRevision);
  const drawing=findDrawing(ctx.db,request.drawingId),floor=findFloor(ctx.db,request.drawingId,request.page);
  if(!drawing||drawing.projectId!==projectId||!floor)throw new ApiFailure(404,'NOT_FOUND','Drawing page not found');
  if(!geometryFitsFloor(request.geometry,floor.floor)||!simplePolygon(request.geometry))throw new ApiFailure(422,'INVALID_GEOMETRY','Draw a simple contour inside the page.');
  if(['ROOM','CORRIDOR'].includes(request.type)&&floorView(ctx.db,floor.floor.id,project.revision).elements.some(e=>['ROOM','CORRIDOR'].includes(e.type)&&intersectionRatio(e.geometry,request.geometry)>Math.min(area(e.geometry),area(request.geometry))*.025))throw new ApiFailure(422,'GEOMETRY_OVERLAP','The new room overlaps an existing room.');
  const id=randomUUID(),evidence=EvidenceSchema.parse({id:randomUUID(),projectId,revision:project.revision+1,drawingId:drawing.id,page:request.page,geometry:request.geometry,source:'USER',text:'User drew a missing architectural element.',capturedAt:ctx.now()});
  const element=ArchitecturalElementSchema.parse({id,projectId,floorId:floor.floor.id,revision:project.revision+1,type:request.type,label:request.label,geometry:request.geometry,relationIds:[],extraction:'USER_CREATED',geometryVerification:'USER_CONFIRMED',evidenceIds:[evidence.id]});
  const {revision}=ctx.db.transaction(()=>{const result=advanceRevision(ctx,getProject(ctx.db,projectId),request.baseRevision,'GEOMETRY_CORRECTION',[id,evidence.id]);insertObservations(ctx.db,{elements:[element],measurements:[],evidence:[evidence]});return result;})();
  const scope={projectId,projectRevision:revision.revision,correlationId:evidence.id};
  await reanalyseAfterRevision(ctx,scope,floor.floor,sessionId=>[createAppEvent('project.revision.created',{...scope,sessionId},{newRevision:revision.revision,changedEntityIds:revision.changedEntityIds})]);
  return {revision,element};
}

/** Retire a spurious object from the new revision, preserving source/history. */
export async function retireElement(ctx:RuntimeContext,elementId:string,request:z.output<typeof GeometryPageRequestSchema>){
  const {element,floor}=loadElement(ctx,elementId),project=getProject(ctx.db,element.projectId);
  if(project.revision!==request.baseRevision)throw revisionConflict(project.revision,request.baseRevision);
  const evidence=EvidenceSchema.parse({id:randomUUID(),projectId:project.id,revision:project.revision+1,drawingId:floor.floor.drawingId,page:floor.floor.page,geometry:element.geometry,source:'USER',text:'User removed a spurious architectural element from this revision.',capturedAt:ctx.now()});
  const {revision}=ctx.db.transaction(()=>{const result=advanceRevision(ctx,getProject(ctx.db,project.id),request.baseRevision,'GEOMETRY_CORRECTION',[element.id,evidence.id]);ctx.db.prepare('UPDATE elements SET retired_revision=? WHERE id=? AND retired_revision IS NULL').run(result.revision.revision,element.id);insertObservations(ctx.db,{elements:[],measurements:[],evidence:[evidence]});return result;})();
  const scope={projectId:project.id,projectRevision:revision.revision,correlationId:evidence.id};
  await reanalyseAfterRevision(ctx,scope,floor.floor,sessionId=>[createAppEvent('project.revision.created',{...scope,sessionId},{newRevision:revision.revision,changedEntityIds:revision.changedEntityIds})]);
  return {revision,element};
}
