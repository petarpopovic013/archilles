import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  ArchitecturalElementSchema,
  EvidenceSchema,
  type ArchitecturalElement,
  type ElementUpdateRequestSchema,
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
  const { element, floor } = loadElement(ctx, elementId);
  const project = getProject(ctx.db, element.projectId);
  if (project.revision !== request.baseRevision) throw revisionConflict(project.revision, request.baseRevision);

  const nextRevision = project.revision + 1;
  const type = request.type ?? element.type;
  const subtype = request.subtype === undefined ? element.subtype : request.subtype ?? undefined;
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

  // Classification and confirmation can change any rule's applicability or a count, so all
  // earlier findings are marked stale rather than only this element's.
  const revision = ctx.db.transaction(() => {
    const result = advanceRevision(ctx, getProject(ctx.db, project.id), request.baseRevision, "GEOMETRY_CORRECTION",
      [element.id, evidence.id]);
    insertObservations(ctx.db, { elements: [], measurements: [], evidence: [evidence] });
    insertElementVersion(ctx.db, updated);
    return result.revision;
  })();

  const scope = { projectId: project.id, projectRevision: revision.revision, correlationId: evidence.id };
  await reanalyseAfterRevision(ctx, scope, floor.floor, (sessionId) => [
    createAppEvent("project.revision.created", { ...scope, sessionId }, { newRevision: revision.revision, changedEntityIds: revision.changedEntityIds }),
  ]);
  return { revision, element: updated };
}
