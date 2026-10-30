import Anthropic from "@anthropic-ai/sdk";
import {
  AnthropicMessages,
  ModelMessageItem,
  SemanticEvent,
  type InferenceInput,
  type InferenceOutput,
  type InferenceRunner,
} from "@mozaik-ai/core";
import { isPricedModel } from "./pricing";
import { providerFailure } from "../../src/vision/provider-errors";

/** Answer text that marks a failed inference; agents treat it as a visible run failure. */
const ERROR_PREFIX = "ARCHILLES_INFERENCE_ERROR:";

export function inferenceErrorCode(answer: string): string | undefined {
  return answer.startsWith(ERROR_PREFIX) ? answer.slice(ERROR_PREFIX.length) : undefined;
}

function errorOutput(code: string, tokenUsage?: InferenceOutput["tokenUsage"]): InferenceOutput {
  return { items: [ModelMessageItem.rehydrate({ text: `${ERROR_PREFIX}${code}` })], tokenUsage, rowResponse: null };
}

function isTransient(error: unknown): boolean {
  return providerFailure(error).retryable;
}

function providerErrorCode(error: unknown): string {
  const failure = providerFailure(error);
  if (failure.code !== "PROVIDER_REJECTED") return failure.code;
  if (error instanceof Error && /^[A-Z_]+(:|$)/.test(error.message)) return error.message.split(":")[0];
  return "INFERENCE_FAILED";
}

/**
 * Claude through Mozaik's own Anthropic request/response mapper, but with our retry policy:
 * SDK retries off, at most one transient retry, bounded timeout, priced models only.
 */
export class ClaudeInferenceRunner implements InferenceRunner {
  private readonly mapper = new AnthropicMessages().endpointMapper;

  constructor(private readonly client: Anthropic, private readonly timeoutMs = 90_000) {}

  async run(input: InferenceInput): Promise<InferenceOutput> {
    if (!isPricedModel(input.model)) throw new Error("UNSUPPORTED_MODEL");
    const request = this.mapper.toRequest(input);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const response = await this.client.messages.create(request, { maxRetries: 0, timeout: this.timeoutMs });
        return this.mapper.toResponse(response);
      } catch (error) {
        if (attempt === 0 && isTransient(error)) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        throw error;
      }
    }
  }

  async *stream(): AsyncGenerator<SemanticEvent> {
    throw new Error("STREAMING_UNSUPPORTED");
  }
}

/**
 * Mozaik's runLoop does not catch its own promise, so a thrown inference error would become an
 * unhandled rejection and stop the process. This wrapper never throws: failures and answerless
 * responses (e.g. refusals) become an error-marker answer that ends the loop normally.
 */
export function safeInferenceRunner(inner: InferenceRunner): InferenceRunner {
  const run = async (input: InferenceInput): Promise<InferenceOutput> => {
    try {
      const output = await inner.run(input);
      const calls = output.items.filter(item => item.type === "function_call");
      if (calls.length > 1 || (calls.length > 0 && !input.tools?.length)) return errorOutput("UNEXPECTED_TOOL_CALL", output.tokenUsage);
      const answered = output.items.some((item) => item.type === "message" || item.type === "function_call");
      if (answered) return output;
      const stopReason = (output.rowResponse as { stop_reason?: string } | null)?.stop_reason;
      return errorOutput(stopReason === "refusal" ? "MODEL_REFUSED" : "NO_ANSWER", output.tokenUsage);
    } catch (error) {
      return errorOutput(providerErrorCode(error));
    }
  };
  return {
    run,
    async *stream(input: InferenceInput) {
      yield SemanticEvent.create("inference.output", "archilles-runtime", await run(input));
    },
  };
}
