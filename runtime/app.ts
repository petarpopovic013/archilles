import type http from "node:http";
import type { AddressInfo } from "node:net";
import type { InferenceRunner } from "@mozaik-ai/core";
import type { RuntimeConfig } from "./config";
import type { RuntimeContext } from "./context";
import { openDatabase, recoverInterruptedWork } from "./db/connection";
import { createRouter } from "./http/routes";
import { createHttpServer } from "./http/server";
import { ArchillesRuntimeState, initializeRuntime, join } from "./mozaik/runtime";
import { createApiParticipant } from "./participants/api";
import { createObserver, EventHub } from "./participants/observer";

export interface StartOptions {
  config: RuntimeConfig;
  /** Tests inject a fake runner so no provider call is made. */
  inferenceRunner?: InferenceRunner;
  now?: () => string;
}

export interface RuntimeApp {
  ctx: RuntimeContext;
  server: http.Server;
  url: string;
  close(): Promise<void>;
}

/**
 * Boots the single persistent runtime: database and restart recovery, Mozaik participants
 * (observer joined first so events persist before anyone reacts), then the loopback HTTP server.
 * Call once per process; Mozaik cannot be initialized twice.
 */
export async function startRuntime({ config, inferenceRunner, now = () => new Date().toISOString() }: StartOptions): Promise<RuntimeApp> {
  const db = openDatabase(config.databasePath);
  const recovered = recoverInterruptedWork(db, now());
  if (recovered.sessions || recovered.runs) {
    console.warn(`[runtime] marked ${recovered.sessions} session(s) and ${recovered.runs} run(s) as interrupted`);
  }

  initializeRuntime({
    state: new ArchillesRuntimeState(),
    ...(inferenceRunner ? { inferenceRunnerConfig: { runner: inferenceRunner } } : {}),
  });
  const hub = new EventHub();
  const api = createApiParticipant();
  join(createObserver(db, hub));
  join(api);

  const ctx: RuntimeContext = { config, db, hub, api, now };
  const server = createHttpServer(createRouter(ctx));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => resolve());
  });
  const { port } = server.address() as AddressInfo;

  return {
    ctx,
    server,
    url: `http://${config.host}:${port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
