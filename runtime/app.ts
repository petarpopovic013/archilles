import type http from "node:http";
import type { AddressInfo } from "node:net";
import type { InferenceRunner } from "@mozaik-ai/core";
import { Budget } from "./ai/budget";
import { safeInferenceRunner } from "./ai/inference";
import { applyTelemetryDefaults, type RuntimeConfig } from "./config";
import type { RuntimeContext } from "./context";
import { openDatabase, recoverInterruptedWork } from "./db/connection";
import { insertParticipant } from "./db/repo";
import { createRouter } from "./http/routes";
import { createHttpServer } from "./http/server";
import { ArchillesRuntimeState, initializeRuntime, join } from "./mozaik/runtime";
import { createApiParticipant } from "./participants/api";
import { createEngineBridge } from "./participants/engine-bridge";
import { createGeometryAgent } from "./participants/geometry";
import { createObserver, EventHub } from "./participants/observer";
import { createRegulationAgent } from "./participants/regulation";
import { createReviewAgent } from "./participants/review";
import type { GeometryPort, RegistryPort } from "./ports";
import { PrivateStore } from "./storage/private-store";

export interface StartOptions {
  config: RuntimeConfig;
  registry: RegistryPort;
  geometry: GeometryPort;
  /** Model access for Mozaik agent loops; tests inject a fake so no provider call is made. */
  inferenceRunner: InferenceRunner;
  now?: () => string;
}

export interface RuntimeApp {
  ctx: RuntimeContext;
  server: http.Server;
  url: string;
  participants: { api: string; geometry: string; regulation: string; bridge: string; review: string };
  close(): Promise<void>;
}

/**
 * Boots the single persistent runtime: database and restart recovery, Mozaik participants
 * (observer joined first so events persist before anyone reacts), then the loopback HTTP server.
 * Call once per process; Mozaik cannot be initialized twice.
 */
export async function startRuntime(options: StartOptions): Promise<RuntimeApp> {
  const { config, now = () => new Date().toISOString() } = options;
  applyTelemetryDefaults();
  const db = openDatabase(config.databasePath);
  const recovered = recoverInterruptedWork(db, now());
  if (recovered.sessions || recovered.runs) {
    console.warn(`[runtime] marked ${recovered.sessions} session(s) and ${recovered.runs} run(s) as interrupted`);
  }

  initializeRuntime({
    state: new ArchillesRuntimeState(),
    inferenceRunnerConfig: { runner: safeInferenceRunner(options.inferenceRunner) },
  });
  const hub = new EventHub();
  const api = createApiParticipant();
  const ctx: RuntimeContext = {
    config,
    db,
    hub,
    api,
    store: new PrivateStore(config.dataDir),
    budget: new Budget(db, config.aiBudgetUsd),
    registry: options.registry,
    geometry: options.geometry,
    liveParticipantIds: [],
    now,
  };

  const geometry = createGeometryAgent(ctx);
  const regulation = createRegulationAgent(ctx, () => geometry.getId());
  const bridge = createEngineBridge(ctx, () => ({ geometry: geometry.getId(), regulation: regulation.getId() }));
  const review = createReviewAgent(ctx, () => bridge.getId());
  for (const participant of [createObserver(db, hub), api, geometry, regulation, bridge, review]) {
    const { id, name, role } = participant.getManifest();
    insertParticipant(db, { id, name, kind: role === "agent" ? "AGENT" : "HUMAN" }, now());
    ctx.liveParticipantIds.push(id);
    join(participant);
  }

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
    participants: {
      api: api.getId(),
      geometry: geometry.getId(),
      regulation: regulation.getId(),
      bridge: bridge.getId(),
      review: review.getId(),
    },
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    },
  };
}
