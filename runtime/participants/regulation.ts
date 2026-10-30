import { createAgent, type Agent } from "@mozaik-ai/core";
import { fingerprint, projectFacts } from "../../src/rules/engine";
import type { RuntimeContext } from "../context";
import { claimPendingInput, findSession, floorView, saveSession } from "../db/repo";
import { createAppEvent, defineAppHandler, emitAppEvent, errorCode, type EventScope } from "../mozaik/app-events";
import { coordination, typesKey } from "../mozaik/runtime";
import { findProject } from "../services/projects";
import { finishRun, startRun } from "../services/runs";
import { scopeOf } from "./geometry";

/**
 * Regulation Agent. Proposes relevant ACTIVE rule IDs from project metadata and the element types
 * Geometry has found, using the registry's deterministic selection. It never activates rules and
 * never decides PASS/FAIL; the engine re-checks applicability independently.
 */
export function createRegulationAgent(ctx: RuntimeContext, geometryId: () => string): Agent {

  async function select(sessionId: string, scope: EventScope): Promise<void> {
    const state = coordination(sessionId);
    if (!state) return;
    const project = findProject(ctx.db, state.projectId);
    // A newer revision supersedes this session; its own session selects for the new data.
    if (!project || project.revision !== state.projectRevision) return;

    const view = floorView(ctx.db, state.floorId, state.projectRevision);
    const types = typesKey(view.elements.map((element) => element.type));
    const key = `selection:${fingerprint([state.ruleSetVersion, projectFacts(project), types])}`;
    if (state.fingerprints.has(key)) return;
    state.fingerprints.add(key);

    const run = startRun(ctx, sessionId, agent.getId(), "REGULATION");
    try {
      const active = await ctx.registry.getActiveRules(state.asOf);
      const selection = await ctx.registry.selectApplicableRules(project, view.elements, active);
      const activeIds = new Set(active.map((rule) => rule.id));
      const ruleIds = [...new Set(selection.ruleIds)].filter((id) => activeIds.has(id));
      const explanations = Object.fromEntries(Object.entries(selection.explanations).filter(([id]) => ruleIds.includes(id)));

      state.selectedRuleIds = ruleIds;
      state.rules = "READY";
      state.selectionTypesKey = types;
      const session = findSession(ctx.db, sessionId);
      if (session) saveSession(ctx.db, { ...session, selectedRuleIds: ruleIds });
      finishRun(ctx, run.id, { status: "COMPLETED", estimatedCostUsd: 0 });

      emitAppEvent(agent, createAppEvent("regulation.rules.selected", scope, {
        ruleIds, explanations, missingContext: selection.missingContext,
      }));
      for (const field of new Set(selection.missingContext)) {
        if (!claimPendingInput(ctx.db, `${state.projectRevision}:context:${field}`, sessionId, state.projectRevision, { field })) continue;
        emitAppEvent(agent, createAppEvent("regulation.input.required", scope, {
          field, reason: "Needed to decide whether selected rules apply to this project.", affectedRuleIds: ruleIds,
        }));
      }
    } catch (error) {
      const code = errorCode(error);
      state.rules = "FAILED";
      state.selectionTypesKey = types;
      finishRun(ctx, run.id, { status: "FAILED", errorCode: code, estimatedCostUsd: 0 });
      emitAppEvent(agent, createAppEvent("agent.run.failed", scope, { agentRunId: run.id, errorCode: code, retryable: false }));
    }
  }

  const agent: Agent = createAgent({
    name: "Regulation Agent",
    capabilities: ["rule-selection"],
    instruction: "Select relevant active rules from verified registry metadata and request missing project context. Never activate rules or decide outcomes.",
    tools: [],
    handlers: [
      defineAppHandler({
        types: ["analysis.started"],
        producerIds: () => [ctx.api.getId()],
        handle: (event) => select(event.sessionId!, scopeOf(event)),
      }),
      defineAppHandler({
        types: ["regulation.applicability.requested"],
        producerIds: () => [geometryId()],
        handle: (event) => select(event.sessionId!, scopeOf(event)),
      }),
    ],
  });
  return agent;
}
