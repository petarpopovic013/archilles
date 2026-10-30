import path from "node:path";
import { z } from "zod";

/** Server-side configuration. Secrets stay in the environment; the Anthropic SDK reads its own key. */
const EnvSchema = z.object({
  ARCHILLES_RUNTIME_URL: z.url().default("http://127.0.0.1:4317"),
  ARCHILLES_DATA_DIR: z.string().trim().min(1).default("./data"),
  ARCHILLES_AI_BUDGET_USD: z.coerce.number().nonnegative().default(20),
  ARCHILLES_REVIEW_MODEL: z.string().trim().min(1).default("claude-haiku-4-5"),
});

export interface RuntimeConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  uploadsDir: string;
  aiBudgetUsd: number;
  reviewModel: string;
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
    uploadsDir: path.join(dataDir, "uploads"),
    aiBudgetUsd: parsed.ARCHILLES_AI_BUDGET_USD,
    reviewModel: parsed.ARCHILLES_REVIEW_MODEL,
  };
}
