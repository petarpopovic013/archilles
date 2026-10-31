import path from "node:path";
import { z } from "zod";

/** Server-side configuration. Secrets stay in the environment; the Anthropic SDK reads its own key. */
const EnvSchema = z.object({
  ARCHILLES_RUNTIME_URL: z.url().default("http://127.0.0.1:4317"),
  ARCHILLES_DATA_DIR: z.string().trim().min(1).default("./data"),
  ARCHILLES_AI_BUDGET_USD: z.coerce.number().nonnegative().default(20),
  ARCHILLES_AI_HOURLY_LIMIT_USD: z.coerce.number().nonnegative().default(3),
  ARCHILLES_REVIEW_MODEL: z.string().trim().min(1).default("claude-sonnet-4-6"),
  ARCHILLES_VISION_MODEL: z.string().trim().min(1).default("claude-sonnet-4-6"),
});

export interface RuntimeConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  aiBudgetUsd: number;
  /** Rolling one-hour spend cap; keeps the total budget from being burnt in one burst. */
  aiHourlyLimitUsd: number;
  reviewModel: string;
  visionModel: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const parsed = EnvSchema.parse(env);
  const url = new URL(parsed.ARCHILLES_RUNTIME_URL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("The MVP runtime listens on the loopback interface only");
  }
  const dataDir = path.resolve(parsed.ARCHILLES_DATA_DIR);
  return {
    host: "127.0.0.1",
    port: Number(url.port || 4317),
    dataDir,
    databasePath: path.join(dataDir, "archilles.sqlite"),
    aiBudgetUsd: parsed.ARCHILLES_AI_BUDGET_USD,
    aiHourlyLimitUsd: parsed.ARCHILLES_AI_HOURLY_LIMIT_USD,
    reviewModel: parsed.ARCHILLES_REVIEW_MODEL,
    visionModel: parsed.ARCHILLES_VISION_MODEL,
  };
}

/**
 * Mozaik's loop publisher forwards full loop payloads (prompts, answers) to Mozaik cloud whenever
 * a MOZAIK_API_KEY or paired credential exists. Default to content redaction so confidential
 * project data never leaves the machine unless someone deliberately opts out.
 */
export function applyTelemetryDefaults(env: NodeJS.ProcessEnv = process.env): void {
  env.MOZAIK_REDACTION ??= "content";
}
