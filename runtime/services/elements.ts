import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  ArchitecturalElementSchema,
  EvidenceSchema,
  type ArchitecturalElement,
  type ElementUpdateRequestSchema,
  type ElementsUpdateRequestSchema,
  type ProjectRevision,
} from "../../src/domain";
import type { RuntimeContext } from "../context";
import { insertElementVersion, insertObservations } from "../db/repo";
import { revisionConflict } from "../http/errors";
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
    updates: [{ elementId, type: request.type, subtype: request.subtype }],
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
    const type = update.type ?? element.type;
    const subtype = update.subtype === undefined ? element.subtype : update.subtype ?? undefined;
    const evidence = EvidenceSchema.parse({
      id: randomUUID(),
      projectId: project.id,
      revision: nextRevision,
      drawingId: floor.floor.drawingId,
      page: floor.floor.page,
      geometry: element.geometry,
      source: "USER",
      text: `User confirmed element as ${type}${subtype ? ` (${subtype})` : ""}.`,
      capturedAt: ctx.now(),
    });
    const updated = ArchitecturalElementSchema.parse({
      ...element,
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
