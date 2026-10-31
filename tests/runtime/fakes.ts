import { createHash } from "node:crypto";
import {
  InputTokenDetails,
  ModelMessageItem,
  OutputTokenDetails,
  TokenUsage,
  UserMessageItem,
  type InferenceInput,
  type InferenceOutput,
  type InferenceRunner,
} from "@mozaik-ai/core";
import type { ComplianceRule, RegulationSource } from "../../src/domain";
import type { VisionRunner } from "../../src/vision/schema";
import { createPngPassthroughRenderer } from "../../runtime/adapters/png-renderer";
import type { GeometryPort, RegistryPort } from "../../runtime/ports";

/**
 * TEST-ONLY fakes. No provider is called; the synthetic rules assert no legal requirement.
 */
export function fakeRegistry(rules: ComplianceRule[], sources: RegulationSource[] = []): RegistryPort & { selections: string[][] } {
  const selections: string[][] = [];
  return {
    selections,
    async getActiveRules() {
      return rules.filter((rule) => rule.lifecycle === "ACTIVE");
    },
    async selectApplicableRules(project, elements, active) {
      // Element rules are proposed only once Geometry has found that element type.
      const types = new Set(elements.map((element) => element.type));
      const ruleIds = active
        .filter((rule) => rule.evaluation.kind === "BOOL" || rule.evaluation.kind.startsWith("COUNT") || types.has(rule.elementType))
        .map((rule) => rule.id);
      selections.push(ruleIds);
      return {
        ruleIds,
        explanations: Object.fromEntries(ruleIds.map((id) => [id, "Synthetic test selection"])),
        missingContext: project.occupantCount === undefined ? ["occupantCount"] : [],
      };
    },
    async snapshot() {
      return { sources, provisionCount: 4, rules };
    },
  };
}

export type VisionScript = (sha256: string) => unknown;

/** Vision fake keyed by raster hash, with latency so concurrency is observable. */
export function fakeVision(script: VisionScript, delayMs = 150): VisionRunner & { calls: number } {
  const runner = {
    model: "claude-opus-5-5",
    calls: 0,
    async run(image: Uint8Array) {
      runner.calls += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      const output = script(createHash("sha256").update(image).digest("hex"));
      if (output instanceof Error) throw output;
      return { output, inputTokens: 1_500, outputTokens: 400 };
    },
  };
  return runner;
}

export function fakeGeometry(vision: VisionRunner): GeometryPort {
  return { renderer: createPngPassthroughRenderer(), vision };
}

/** Answer text the fake gives for a Regulation question, so tests can recognise it. */
export const fakeQuestion = (field: string) => `Test pitanje za ${field}?`;

/**
 * Mozaik InferenceRunner fake: answers Review explanation batches and Regulation question calls
 * with schema-valid JSON, counting each kind of call.
 */
export function fakeInference(mode: { fail?: boolean } = {}): InferenceRunner & { calls: number; byKind: { review: number; questions: number } } {
  const runner = {
    calls: 0,
    byKind: { review: 0, questions: 0 },
    async run(input: InferenceInput): Promise<InferenceOutput> {
      runner.calls += 1;
      const user = input.context.getItems().filter((item): item is UserMessageItem => item instanceof UserMessageItem).at(-1);
      const request = JSON.parse(user?.content.text ?? "{}") as {
        findings?: { findingId: string; status: string }[];
        fields?: { field: string }[];
      };
      const kind = request.fields ? "questions" : "review";
      runner.byKind[kind] += 1;
      if (mode.fail) throw new Error("PROVIDER_UNAVAILABLE");
      const answer = kind === "questions"
        ? { questions: request.fields!.map(({ field }) => ({ field, question: fakeQuestion(field) })) }
        : {
          explanations: (request.findings ?? []).map((finding) => ({
            findingId: finding.findingId,
            explanation: `Reviewed explanation for a ${finding.status} outcome.`,
            suggestedAction: "Confirm the dimension on the drawing.",
          })),
        };
      return {
        items: [ModelMessageItem.rehydrate({ text: JSON.stringify(answer) })],
        tokenUsage: new TokenUsage(1_200, 300, 1_500, new InputTokenDetails(0), new OutputTokenDetails(0)),
        rowResponse: {},
      };
    },
    async *stream(): AsyncGenerator<never> {
      throw new Error("STREAMING_UNSUPPORTED");
    },
  };
  return runner;
}

/** A plan with one labelled corridor and one door without a dimension (raster pixels). */
export function corridorPlan(widthMetres: number) {
  return {
    elements: [
      {
        ref: "corridor-1",
        type: "CORRIDOR",
        label: "Corridor",
        geometry: { kind: "BBOX", x: 40, y: 240, width: 720, height: 100 },
        measurements: [{ metric: "CLEAR_WIDTH_M", value: widthMetres, unit: "m", rawLabel: `${widthMetres} m`, confidence: 0.9 }],
      },
      {
        ref: "door-1",
        type: "DOOR",
        label: "Door",
        geometry: { kind: "BBOX", x: 375, y: 230, width: 50, height: 20 },
        measurements: [],
      },
    ],
    warnings: [],
  };
}
