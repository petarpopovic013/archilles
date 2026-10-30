import { randomUUID } from "node:crypto";
import type { z } from "zod";
import {
  CreateProjectRequestSchema,
  ProjectRevisionSchema,
  ProjectSchema,
  UpdateProjectRequestSchema,
  type Project,
  type ProjectRevision,
} from "../../src/domain";
import type { RuntimeContext } from "../context";
import type { Db } from "../db/connection";
import { notFound, revisionConflict } from "../http/errors";
import { createAppEvent, emitAppEvent } from "../mozaik/app-events";

type CreateProjectInput = z.output<typeof CreateProjectRequestSchema>;
type UpdateProjectInput = z.output<typeof UpdateProjectRequestSchema>;

export function findProject(db: Db, projectId: string): Project | undefined {
  const row = db.prepare("SELECT data FROM projects WHERE id = ?").pluck().get(projectId) as string | undefined;
  return row === undefined ? undefined : ProjectSchema.parse(JSON.parse(row));
}

export function getProject(db: Db, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project) throw notFound("Project");
  return project;
}

export function saveProject(db: Db, project: Project): void {
  const valid = ProjectSchema.parse(project);
  db.prepare(`
    INSERT INTO projects (id, revision, data) VALUES (?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET revision = excluded.revision, data = excluded.data
  `).run(valid.id, valid.revision, JSON.stringify(valid));
}

export function insertRevision(db: Db, revision: ProjectRevision): void {
  const valid = ProjectRevisionSchema.parse(revision);
  db.prepare("INSERT INTO project_revisions (project_id, revision, data) VALUES (?, ?, ?)")
    .run(valid.projectId, valid.revision, JSON.stringify(valid));
}

/**
 * Advances the project to a new revision inside the caller's transaction and marks dependent
 * findings from older revisions stale: those of `staleElementIds` when given, otherwise all of
 * them (metadata can change any rule's applicability). Throws REVISION_CONFLICT on a stale base.
 */
export function advanceRevision(
  ctx: RuntimeContext,
  project: Project,
  baseRevision: number,
  kind: ProjectRevision["kind"],
  changedEntityIds: string[],
  staleElementIds?: readonly string[],
): { project: Project; revision: ProjectRevision } {
  if (project.revision !== baseRevision) throw revisionConflict(project.revision, baseRevision);
  const now = ctx.now();
  const next: Project = { ...project, revision: project.revision + 1, updatedAt: now };
  const revision: ProjectRevision = {
    projectId: project.id,
    revision: next.revision,
    parentRevision: project.revision,
    kind,
    changedEntityIds,
    createdBy: "api",
    createdAt: now,
  };
  saveProject(ctx.db, next);
  insertRevision(ctx.db, revision);
  const markStale = ctx.db.prepare(`
    UPDATE findings SET stale = 1, data = json_set(data, '$.stale', json('true'))
    WHERE project_id = ? AND project_revision < ? AND stale = 0 AND (? IS NULL OR element_id = ?)
  `);
  if (staleElementIds) for (const elementId of staleElementIds) markStale.run(project.id, next.revision, elementId, elementId);
  else markStale.run(project.id, next.revision, null, null);
  return { project: next, revision };
}

export function createProject(ctx: RuntimeContext, input: CreateProjectInput): Project {
  const now = ctx.now();
  const project = ProjectSchema.parse({
    id: randomUUID(),
    ...input,
    revision: 1,
    analysisStatus: "DRAFT",
    createdAt: now,
    updatedAt: now,
  });
  ctx.db.transaction(() => {
    saveProject(ctx.db, project);
    insertRevision(ctx.db, {
      projectId: project.id,
      revision: 1,
      kind: "METADATA",
      changedEntityIds: [project.id],
      createdBy: "api",
      createdAt: now,
    });
  })();
  emitAppEvent(ctx.api, createAppEvent("project.created", {
    projectId: project.id, projectRevision: 1, correlationId: randomUUID(),
  }, {}));
  return project;
}

/** Applies a metadata patch: `null` clears a field or characteristic, omitted fields are unchanged. */
export function updateProject(
  ctx: RuntimeContext,
  projectId: string,
  request: UpdateProjectInput,
): { project: Project; revision: ProjectRevision } {
  const result = ctx.db.transaction(() => {
    const current = getProject(ctx.db, projectId);
    const merged: Record<string, unknown> = { ...current };
    const { characteristics, ...fields } = request.patch;
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null) delete merged[key];
      else merged[key] = value;
    }
    if (characteristics) {
      const next: Record<string, boolean> = { ...current.characteristics };
      for (const [key, value] of Object.entries(characteristics)) {
        if (value === null) delete next[key];
        else if (value !== undefined) next[key] = value;
      }
      merged.characteristics = next;
    }
    return advanceRevision(ctx, ProjectSchema.parse(merged), request.baseRevision, "METADATA", [projectId]);
  })();
  emitAppEvent(ctx.api, createAppEvent("project.revision.created", {
    projectId, projectRevision: result.project.revision, correlationId: randomUUID(),
  }, { newRevision: result.project.revision, changedEntityIds: [projectId] }));
  return result;
}
