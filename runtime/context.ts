import type { Human } from "@mozaik-ai/core";
import type { RuntimeConfig } from "./config";
import type { Db } from "./db/connection";
import type { EventHub } from "./participants/observer";

/** Process-wide dependencies passed to services and HTTP routes. */
export interface RuntimeContext {
  config: RuntimeConfig;
  db: Db;
  hub: EventHub;
  api: Human;
  now(): string;
}
