import type { Human } from "@mozaik-ai/core";
import type { Budget } from "./ai/budget";
import type { RuntimeConfig } from "./config";
import type { Db } from "./db/connection";
import type { EventHub } from "./participants/observer";
import type { GeometryPort, RegistryPort } from "./ports";
import type { PrivateStore } from "./storage/private-store";

/** Process-wide dependencies passed to services, participants, and HTTP routes. */
export interface RuntimeContext {
  config: RuntimeConfig;
  db: Db;
  hub: EventHub;
  api: Human;
  store: PrivateStore;
  budget: Budget;
  registry: RegistryPort;
  geometry: GeometryPort;
  /** Joined Mozaik participant IDs of this process, filled in at boot. */
  liveParticipantIds: string[];
  now(): string;
}

/** Calendar date used for rule effectiveness. */
export const asOfDate = (ctx: RuntimeContext) => ctx.now().slice(0, 10);
