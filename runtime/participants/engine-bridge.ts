import { randomUUID } from "node:crypto";
import { createHuman, type Human } from "@mozaik-ai/core";
import type { EvaluationStatus } from "../../src/domain";
import { evaluateRules, fingerprint } from "../../src/rules/engine";
import type { RuntimeContext } from "../context";
import { floorView, insertEvaluation } from "../db/repo";
import { createAppEvent, defineAppHandler, emitAppEvent, errorCode, type EventScope } from "../mozaik/app-events";
import { coordination } from "../mozaik/runtime";
import { findProject } from "../services/projects";
import { finishSession } from "../services/runs";
import { scopeOf } from "./geometry";

/**
 * Deterministic engine bridge (not an LLM agent). Waits until geometry has settled and rule
 * selection covers the element types geometry produced, then evaluates exactly once per session
 * and persists every outcome before announcing it.
 */
export function createEngineBridge(ctx: RuntimeContext, producers: () => { geometry: string; regulation: string }): Human {

  async function tryEvaluate(sessionId: string, scope: EventScope): Promise<void> {
    const state = coordination(sessionId);
    if (!state || state.fingerprints.has("evaluation")) return;
    if (state.geometry === "PENDING") return;
    // A newer revision supersedes this session; its agents ignore it, so do not wait for them.
    if (findProject(ctx.db, state.projectId)?.revision !== state.projectRevision) {
      state.fingerprints.add("evaluation");
      finishSession(ctx, sessionId, "PARTIAL", "REVISION_SUPERSEDED");
      return;
    }
    if (state.rules === "PENDING") return;
    // Wait for the refined selection when geometry found element types the last selection lacked.
    if (state.rules === "READY" && state.selectionTypesKey !== state.geometryTypesKey) return;
    state.fingerprints.add("evaluation");
    try {
      await evaluate(sessionId, scope);
    } catch (error) {
      // Nothing was evaluated: the session cannot produce findings.
      finishSession(ctx, sessionId, "FAILED", errorCode(error));
    }
  }

  async function evaluate(sessionId: string, scope: EventScope): Promise<void> {
    const state = coordination(sessionId)!;
    const project = findProject(ctx.db, state.projectId);
    if (!project || project.revision !== state.projectRevision) {
      finishSession(ctx, sessionId, "PARTIAL", "REVISION_SUPERSEDED");
      return;
    }
    const view = floorView(ctx.db, state.floorId, state.projectRevision);
    const selected = new Set(state.rules === "READY" ? state.selectedRuleIds : []);
    const rules = (await ctx.registry.getActiveRules(state.asOf)).filter((rule) => selected.has(rule.id));
    const { results } = evaluateRules(rules, {
      project,
      elements: view.elements,
      measurements: view.measurements,
      asOf: state.asOf,
      now: ctx.now(),
      newId: randomUUID,
    });

    emitAppEvent(bridge, createAppEvent("rule.evaluation.requested", scope, {
      ruleIds: rules.map((rule) => rule.id),
      elementIds: view.elements.map((element) => element.id),
      inputFingerprint: fingerprint(results.map((result) => result.fingerprint).sort()),
    }));
    ctx.db.transaction(() => {
      for (const result of results) insertEvaluation(ctx.db, sessionId, result);
    })();
    const statusCounts: Partial<Record<EvaluationStatus, number>> = {};
    for (const { evaluation } of results) statusCounts[evaluation.status] = (statusCounts[evaluation.status] ?? 0) + 1;
    emitAppEvent(bridge, createAppEvent("rule.evaluation.completed", scope, {
      evaluationIds: results.map(({ evaluation }) => evaluation.id),
      statusCounts,
    }));
  }

  const handle = (event: { sessionId?: string; projectId: string; projectRevision: number; correlationId: string }) =>
    tryEvaluate(event.sessionId!, scopeOf(event));

  const bridge: Human = createHuman({
    name: "Engine Bridge",
    capabilities: ["deterministic-evaluation"],
    handlers: [
      defineAppHandler({
        types: ["geometry.extraction.completed"],
        producerIds: () => [producers().geometry],
        handle,
      }),
      defineAppHandler({
        types: ["regulation.rules.selected"],
        producerIds: () => [producers().regulation],
        handle,
      }),
      defineAppHandler({
        types: ["agent.run.failed"],
        producerIds: () => [producers().geometry, producers().regulation],
        handle,
      }),
    ],
  });
  return bridge;
}
