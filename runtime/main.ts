import Anthropic from "@anthropic-ai/sdk";
import { createClaudeVisionRunner } from "../src/vision/claude";
import { createPendingRegistry } from "./adapters/pending-registry";
import { createPngPassthroughRenderer } from "./adapters/png-renderer";
import { ClaudeInferenceRunner } from "./ai/inference";
import { startRuntime } from "./app";
import { loadConfig } from "./config";
import { errorCode } from "./mozaik/app-events";

// Last line of defence: log a code and keep serving rather than letting one failure end the demo.
process.on("unhandledRejection", (reason) => {
  console.error(`[runtime] unhandled rejection: ${errorCode(reason)}`);
});

async function main() {
  const config = loadConfig();
  // Credentials stay inside the SDK client (environment or `ant auth` profile), never in prompts.
  const client = new Anthropic({ maxRetries: 0 });
  const app = await startRuntime({
    config,
    registry: createPendingRegistry(),
    geometry: {
      renderer: createPngPassthroughRenderer(),
      vision: createClaudeVisionRunner(client, config.visionModel),
    },
    inferenceRunner: new ClaudeInferenceRunner(client),
  });
  console.log(`[runtime] listening on ${app.url}`);
  console.warn("[runtime] rule registry not yet integrated: no active rules will be selected or executed");

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[runtime] ${signal}: shutting down`);
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error(`[runtime] failed to start: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
