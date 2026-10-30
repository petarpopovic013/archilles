import { defineRuntime, RuntimeState } from "@mozaik-ai/core";

export type ComponentState = "PENDING" | "READY" | "BLOCKED" | "FAILED";

/** Live coordination only. SQLite is the system of record; no image bytes live here. */
export interface SessionCoordination {
  projectId: string;
  projectRevision: number;
  drawingId: string;
  floorId: string;
  page: number;
  ruleSetVersion: string;
  asOf: string;
  geometry: ComponentState;
  rules: ComponentState;
  /** Element types the latest geometry result and the latest rule selection were based on. */
  geometryTypesKey?: string;
  selectionTypesKey?: string;
  selectedRuleIds: string[];
  /** Work already done, keyed by purpose (selection, evaluation), for at-most-once guards. */
  fingerprints: Set<string>;
  /** Any participant failure makes the session PARTIAL instead of COMPLETE. */
  failed: boolean;
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

export function coordination(sessionId: string | undefined): SessionCoordination | undefined {
  return sessionId ? resolveRuntime().state.sessions.get(sessionId) : undefined;
}

/** Stable key for a set of element types, so selection and geometry can be compared. */
export function typesKey(types: Iterable<string>): string {
  return [...new Set(types)].sort().join(",");
}
