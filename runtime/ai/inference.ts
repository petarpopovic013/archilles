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

/** Answer text that marks a failed inference; agents treat it as a visible run failure. */
const ERROR_PREFIX = "ARCHILLES_INFERENCE_ERROR:";

export function inferenceErrorCode(answer: string): string | undefined {
  return answer.startsWith(ERROR_PREFIX) ? answer.slice(ERROR_PREFIX.length) : undefined;
}

function errorOutput(code: string, tokenUsage?: InferenceOutput["tokenUsage"]): InferenceOutput {
  return { items: [ModelMessageItem.rehydrate({ text: `${ERROR_PREFIX}${code}` })], tokenUsage, rowResponse: null };
}

function isTransient(error: unknown): boolean {
  return error instanceof Anthropic.APIConnectionError ||
    (error instanceof Anthropic.APIError && (error.status === 429 || (error.status ?? 0) >= 500));
}

function providerErrorCode(error: unknown): string {
  if (error instanceof Anthropic.APIConnectionError) return "PROVIDER_UNREACHABLE";
  if (error instanceof Anthropic.APIError) {
    if (error.status === 429) return "PROVIDER_RATE_LIMITED";
    if (error.status === 401 || error.status === 403) return "PROVIDER_AUTH";
    if ((error.status ?? 0) >= 500) return "PROVIDER_UNAVAILABLE";
    return "PROVIDER_REJECTED";
  }
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
      const answered = output.items.some((item) => item.type === "message");
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
