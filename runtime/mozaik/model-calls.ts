import { randomUUID } from "node:crypto";
import {
  DeveloperMessageItem,
  ModelContext,
  SituationSpecification,
  type SituationContext,
  type SituationHandler,
} from "@mozaik-ai/core";
import type { Reservation } from "../ai/budget";
import { inferenceErrorCode } from "../ai/inference";
import { estimateCostUsd } from "../ai/pricing";
import type { Db } from "../db/connection";
import { errorCode } from "./app-events";
import { runLoop } from "./runtime";

/** Models that accept `output_config.effort` with adaptive thinking. */
const EFFORT_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"]);

export interface ModelCallResult {
  /** The answer text; empty when the call failed. */
  text: string;
  /** Set when the call failed (provider error, refusal, no answer). */
  errorCode?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ModelCallRequest {
  /** AgentRun the call belongs to; loop diagnostics are recorded against it. */
  runId: string;
  model: string;
  instruction: string;
  /** Sent as the user message (JSON); never contains drawings or secrets. */
  payload: Record<string, unknown>;
  schema: Record<string, unknown>;
  schemaName: string;
  maxOutputTokens: number;
  /** Budget already reserved for the worst case; settled when the answer arrives. */
  reservation: Reservation;
  onDone(result: ModelCallResult): void;
}

interface Pending extends ModelCallRequest {
  inputTokens: number;
  outputTokens: number;
}

/**
 * One-shot structured model calls through a real Mozaik agent loop. `runLoop` returns nothing,
 * so completion is tracked from the agent's own loop events: the first message carries a call ID,
 * `inference.completed` adds token usage, and `model.answer` finishes the call.
 * Join the returned handler to the agent that makes the calls.
 */
export function createModelCalls(db: Db, agentId: () => string, now: () => string) {
  const pending = new Map<string, Pending>();
  const loops = new Map<string, string>();
  // Allowlisted diagnostics only: event types per loop, never context, arguments, or answers.
  const record = db.prepare("INSERT INTO agent_loop_events (run_id, loop_id, type, occurred_at) VALUES (?, ?, ?, ?)");

  function finish(callId: string, text: string): void {
    const call = pending.get(callId);
    if (!call) return;
    pending.delete(callId);
    call.reservation.settle();
    const failure = inferenceErrorCode(text);
    call.onDone({
      text: failure ? "" : text,
      errorCode: failure,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      costUsd: estimateCostUsd(call.model, call.inputTokens, call.outputTokens),
    });
  }

  const handler: SituationHandler = {
    specification: new (class extends SituationSpecification {
      isSatisfiedBy({ event, participant }: SituationContext) {
        return event.producerId === participant.getId() &&
          (event.type === "message_received.started" || event.type === "inference.started" ||
            event.type === "inference.completed" || event.type === "model.answer");
      }
    })(),
    processor: {
      apply({ event }) {
        try {
          const payload = event.payload as {
            loopId: string;
            content?: string;
            tokenUsage?: { inputTokens: number; outputTokens: number };
            answer?: { content: { text: string } };
          };
          if (event.type === "message_received.started") {
            const { callId } = JSON.parse(payload.content ?? "{}") as { callId?: string };
            if (callId && pending.has(callId)) loops.set(payload.loopId, callId);
          }
          const callId = loops.get(payload.loopId);
          const call = callId ? pending.get(callId) : undefined;
          if (!callId || !call) return;
          record.run(call.runId, payload.loopId, event.type, now());
          if (event.type === "message_received.started") return;
          if (event.type === "inference.started") return;
          if (event.type === "inference.completed") {
            call.inputTokens += payload.tokenUsage?.inputTokens ?? 0;
            call.outputTokens += payload.tokenUsage?.outputTokens ?? 0;
            return;
          }
          loops.delete(payload.loopId);
          finish(callId, payload.answer?.content.text ?? "");
        } catch (error) {
          console.error(`[runtime] model call event failed: ${errorCode(error)}`);
        }
      },
    },
  };

  function start(request: ModelCallRequest): void {
    const callId = randomUUID();
    pending.set(callId, { ...request, inputTokens: 0, outputTokens: 0 });
    runLoop(agentId(), JSON.stringify({ callId, ...request.payload }), {
      model: request.model,
      context: ModelContext.create().addContextItem(DeveloperMessageItem.create(request.instruction)),
      maxOutputTokens: request.maxOutputTokens,
      ...(EFFORT_MODELS.has(request.model) ? { reasoningEffort: "low" } : {}),
      structuredOutput: { name: request.schemaName, schema: request.schema, strict: true },
    });
  }

  return { handler, start };
}
