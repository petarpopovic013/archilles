import { randomUUID } from 'node:crypto';
import {
  DeveloperMessageItem, ModelContext, ModelMessageItem, SituationSpecification,
  type Agent, type ExecutableTransition, type InterceptionHandler, type SituationHandler, type Tool, type StructuredOutputFormat,
} from '@mozaik-ai/core';
import { z } from 'zod';
import { GeometryError } from '../../src/geometry/types';
import { inferenceErrorCode } from '../ai/inference';
import type { Reservation } from '../ai/budget';
import { estimateCostUsd, isPricedModel } from '../ai/pricing';
import type { RuntimeContext } from '../context';
import { errorCode } from './app-events';
import { runLoop } from './runtime';

export const TOOL_LOOP_VERSION = 'mozaik-tools-v1';
const Args = z.strictObject({ batchId: z.uuid() });
const MAX_INFERENCES = 2;
const MAX_OUTPUT_TOKENS = 1024;
const MAX_CONTEXT_CHARS = 48_000;
const LoopEvent = z.object({ loopId: z.uuid() });
const UsageEvent = LoopEvent.extend({ tokenUsage: z.object({ inputTokens: z.number().nonnegative(), outputTokens: z.number().nonnegative() }).optional() });
const AnswerEvent = LoopEvent.extend({ answer: z.object({ content: z.object({ text: z.string() }) }) });
const StartEvent = LoopEvent.extend({ content: z.string() });
const eventTypes = new Set(['message_received.started', 'inference.started', 'inference.completed', 'function_call.started', 'function_call.completed', 'model.answer']);

export interface ToolLoopResult {
  answer: string;
  error?: GeometryError;
  loopId?: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** Caller updates the AgentRun cost ledger before releasing these reservations. */
  release(): void;
}
interface Task {
  id: string; runId: string; model: string; current(): boolean;
  invoke(): Promise<unknown>; resolve(result: ToolLoopResult): void;
  result: ToolLoopResult; reservations: Reservation[];
  calls: number; inferences: number; error?: GeometryError; finished: boolean;
}

/** One registered tool, one invocation and two inferences per private session context. */
export function createToolLoops(ctx: RuntimeContext, getAgent: () => Agent, name: string, description: string) {
  const tasks = new Map<string, Task>();
  const seen = new WeakSet<object>();
  const loops = new Map<string, Task>();
  const record = ctx.db.prepare('INSERT INTO agent_loop_events (run_id, loop_id, type, occurred_at) VALUES (?, ?, ?, ?)');

  function fail(task: Task, error: unknown) {
    task.error ??= error instanceof GeometryError ? error : new GeometryError(errorCode(error));
  }
  function complete(task: Task, answer: string) {
    if (task.finished) return;
    task.finished = true;
    tasks.delete(task.id); if (task.result.loopId) loops.delete(task.result.loopId);
    const inferenceFailure = inferenceErrorCode(answer);
    if (inferenceFailure) fail(task, new GeometryError(inferenceFailure));
    if (!task.current()) fail(task, new GeometryError('REVISION_SUPERSEDED'));
    if (!task.calls && !task.error) fail(task, new GeometryError('AGENT_TOOL_REQUIRED'));
    task.result.answer = answer;
    task.result.error = task.error;
    task.result.estimatedCostUsd = estimateCostUsd(task.model, task.result.inputTokens, task.result.outputTokens);
    task.resolve(task.result);
  }
  const tool: Tool = {
    type: 'function', name, description, strict: true,
    parameters: { type: 'object', additionalProperties: false, properties: { batchId: { type: 'string' } }, required: ['batchId'] },
    async invoke(args: unknown) {
      const parsed = Args.safeParse(args);
      if (!parsed.success) return { errorCode: 'INVALID_TOOL_ARGUMENTS' };
      const task = tasks.get(parsed.data.batchId);
      if (!task || task.finished) return { errorCode: 'AGENT_TASK_EXPIRED' };
      try {
        if (!task.current()) throw new GeometryError('REVISION_SUPERSEDED');
        if (task.calls++) throw new GeometryError('AGENT_TOOL_LIMIT');
        const output = await task.invoke();
        if (!task.current() || task.finished) throw new GeometryError('REVISION_SUPERSEDED');
        return output;
      } catch (error) {
        fail(task, error);
        return { errorCode: task.error!.code };
      }
    },
  };

  const handler: SituationHandler = {
    specification: new (class extends SituationSpecification {
      isSatisfiedBy({ event, participant }: Parameters<SituationSpecification['isSatisfiedBy']>[0]) {
        return event.producerId === participant.getId() && eventTypes.has(event.type);
      }
    })(),
    processor: { apply({ event }) {
      if (seen.has(event)) return;
      seen.add(event);
      const envelope = LoopEvent.safeParse(event.payload);
      if (!envelope.success) return;
      if (event.type === 'message_received.started') {
        const start = StartEvent.safeParse(event.payload);
        if (!start.success) return;
        try {
          const { batchId } = z.object({ batchId: z.uuid() }).parse(JSON.parse(start.data.content));
          const task = tasks.get(batchId);
          if (task && !task.result.loopId) { task.result.loopId = envelope.data.loopId; loops.set(envelope.data.loopId, task); }
        } catch { return; }
      }
      const task = loops.get(envelope.data.loopId);
      if (!task || task.finished) return;
      record.run(task.runId, envelope.data.loopId, event.type, ctx.now());
      if (event.type === 'inference.completed') {
        const usage = UsageEvent.safeParse(event.payload);
        if (!usage.success) { fail(task, new GeometryError('AGENT_USAGE_INVALID')); return; }
        task.result.inputTokens += usage.data.tokenUsage?.inputTokens ?? 0;
        task.result.outputTokens += usage.data.tokenUsage?.outputTokens ?? 0;
      }
      if (event.type === 'model.answer') {
        const answer = AnswerEvent.safeParse(event.payload);
        if (!answer.success) fail(task, new GeometryError('AGENT_ANSWER_INVALID'));
        complete(task, answer.success ? answer.data.answer.content.text : '');
      }
    } },
  };

  function run(input: { runId: string; model: string; instruction: string; data: Record<string, unknown>; current(): boolean; invoke(): Promise<unknown>; structuredOutput?: StructuredOutputFormat }): Promise<ToolLoopResult> {
    return new Promise(resolve => {
      const reservations: Reservation[] = [];
      const task: Task = {
        id: randomUUID(), runId: input.runId, model: input.model, current: input.current, invoke: input.invoke,
        resolve, reservations, calls: 0, inferences: 0, finished: false,
        result: { answer: '', inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, release: () => reservations.forEach(reservation => reservation.settle()) },
      };
      tasks.set(task.id, task);
      const stop = (): ExecutableTransition => ({ nextStateId: 'model_message', input: { answer: ModelMessageItem.rehydrate({ text: 'ARCHILLES_INFERENCE_ERROR:' + (task.error?.code ?? 'AGENT_TASK_EXPIRED') }) } });
      const interception: InterceptionHandler = {
        isSatisfiedBy: () => true,
        async handle(transition) {
          try {
            if (transition.nextStateId === "message_received") return transition;
            if (!task.current()) throw new GeometryError('REVISION_SUPERSEDED');
            if (task.finished || task.error) return stop();
            if (transition.nextStateId === 'inference' || transition.nextStateId === 'inference_streaming') {
              if (task.inferences++ >= MAX_INFERENCES) throw new GeometryError('AGENT_INFERENCE_LIMIT');
              if (!isPricedModel(task.model)) throw new GeometryError('UNPRICED_MODEL');
              const size = JSON.stringify(transition.input.context.getItems()).length;
              if (size > MAX_CONTEXT_CHARS) throw new GeometryError('AGENT_CONTEXT_LIMIT');
              reservations.push(ctx.budget.reserve(2 * estimateCostUsd(task.model, size + 2_000, MAX_OUTPUT_TOKENS)));
            }
            if (transition.nextStateId === 'function_call') {
              let raw: unknown;
              try { raw = JSON.parse(transition.input.call.args); } catch { throw new GeometryError('INVALID_TOOL_ARGUMENTS'); }
              const args = Args.safeParse(raw);
              if (transition.input.call.name !== name || !args.success || args.data.batchId !== task.id) throw new GeometryError('AGENT_TOOL_SCOPE');
              if (task.calls) throw new GeometryError('AGENT_TOOL_LIMIT');
            }
            return transition;
          } catch (error) { fail(task, error); return stop(); }
        },
      };
      try {
        runLoop(getAgent().getId(), JSON.stringify({ ...input.data, batchId: task.id }), {
          model: input.model,
          context: ModelContext.create().addContextItem(DeveloperMessageItem.create(input.instruction)),
          tools: getAgent().getTools(), maxOutputTokens: MAX_OUTPUT_TOKENS, structuredOutput: input.structuredOutput,
        }, interception);
      } catch (error) { fail(task, error); complete(task, ''); }
    });
  }
  return { tool, handler, run };
}
