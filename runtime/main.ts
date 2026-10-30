import { startRuntime } from "./app";
import { loadConfig } from "./config";

async function main() {
  const app = await startRuntime({ config: loadConfig() });
  console.log(`[runtime] listening on ${app.url}`);

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
