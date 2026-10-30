import { defineRuntime, RuntimeState } from "@mozaik-ai/core";

export type ComponentState = "PENDING" | "READY" | "BLOCKED" | "FAILED";

/** Live coordination only. SQLite is the system of record; no image bytes live here. */
export interface SessionCoordination {
  projectId: string;
  projectRevision: number;
  geometry: ComponentState;
  rules: ComponentState;
  selectedRuleIds: string[];
  /** Fingerprints already handled, keyed by purpose (selection, evaluation, review). */
  fingerprints: Set<string>;
  aiCalls: number;
}

export class ArchillesRuntimeState extends RuntimeState {
  sessions = new Map<string, SessionCoordination>();
  /** `${participantId}:${eventId}` pairs already processed; duplicate deliveries are ignored. */
  processedEvents = new Set<string>();
}

/** One Mozaik runtime per process (initializeRuntime throws on a second call). */
export const {
  initializeRuntime,
  resolveRuntime,
  join,
  leave,
  sendEvent,
  runLoop,
} = defineRuntime<ArchillesRuntimeState>();
