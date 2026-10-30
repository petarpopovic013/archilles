import {
  CreateProjectRequestSchema,
  IdSchema,
  UpdateProjectRequestSchema,
} from "../../src/domain";
import type { RuntimeContext } from "../context";
import { createProject, getProject, updateProject } from "../services/projects";
import { notFound } from "./errors";
import { Router } from "./server";

/** Opaque IDs are UUIDs; anything else cannot exist, so it is a 404 rather than a lookup. */
function idParam(value: string, entity: string): string {
  if (!IdSchema.safeParse(value).success) throw notFound(entity);
  return value;
}

/** Runtime routes mirror the public `/api` contract in Tech.MD §5 and `apiContracts`. */
export function createRouter(ctx: RuntimeContext): Router {
  return new Router()
    .add("GET", "/health", () => ({ status: "ok" }))
    .add("POST", "/api/projects", async (req) =>
      createProject(ctx, await req.json(CreateProjectRequestSchema)), 201)
    .add("GET", "/api/projects/:id", (req) =>
      getProject(ctx.db, idParam(req.params.id, "Project")))
    .add("PATCH", "/api/projects/:id", async (req) =>
      updateProject(ctx, idParam(req.params.id, "Project"), await req.json(UpdateProjectRequestSchema)));
}
