import { randomUUID } from "node:crypto";
import type { AgentRun, AnalysisStatus } from "../../src/domain";
import type { RuntimeContext } from "../context";
import { findRun, findSession, saveRun, saveSession } from "../db/repo";
import { coordination, resolveRuntime } from "../mozaik/runtime";
import { findProject, saveProject } from "./projects";

/** Records real agent work: one AgentRun per participant task, linked to its session. */
export function startRun(
  ctx: RuntimeContext,
  sessionId: string,
  participantId: string,
  role: AgentRun["role"],
  model?: string,
): AgentRun {
  const run: AgentRun = {
    id: randomUUID(),
    sessionId,
    participantId,
    role,
    status: "STARTED",
    model,
    startedAt: ctx.now(),
  };
  ctx.db.transaction(() => {
    saveRun(ctx.db, run);
    const session = findSession(ctx.db, sessionId);
    if (session) saveSession(ctx.db, { ...session, agentRunIds: [...session.agentRunIds, run.id] });
  })();
  return run;
}

export interface RunOutcome {
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  errorCode?: string;
}

export function finishRun(ctx: RuntimeContext, runId: string, outcome: RunOutcome): AgentRun {
  const run = findRun(ctx.db, runId);
  if (!run) throw new Error("RUN_NOT_FOUND");
  const finished: AgentRun = { ...run, ...outcome, model: outcome.model ?? run.model, finishedAt: ctx.now() };
  saveRun(ctx.db, finished);
  if (outcome.status === "FAILED") {
    const state = coordination(run.sessionId);
    if (state) state.failed = true;
  }
  return finished;
}

/** Closes a session once evaluation and review are done; any failure makes it PARTIAL. */
export function finishSession(ctx: RuntimeContext, sessionId: string, status?: AnalysisStatus, errorCode?: string): void {
  const session = findSession(ctx.db, sessionId);
  if (!session || session.status !== "RUNNING") return;
  const state = coordination(sessionId);
  const finalStatus = status ?? (state?.failed ? "PARTIAL" : "COMPLETE");
  ctx.db.transaction(() => {
    saveSession(ctx.db, { ...session, status: finalStatus, finishedAt: ctx.now(), ...(errorCode ? { errorCode } : {}) });
    const project = findProject(ctx.db, session.projectId);
    if (project && project.revision === session.projectRevision) {
      saveProject(ctx.db, { ...project, analysisStatus: finalStatus });
    }
  })();
  resolveRuntime().state.sessions.delete(sessionId);
}
