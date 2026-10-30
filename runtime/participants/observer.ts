import { EventEmitter } from "node:events";
import { createHuman, type Human } from "@mozaik-ai/core";
import { AgentEventSchema, eventPayloadSchemas, type AgentEvent, type AppEventType } from "../../src/domain";
import type { Db } from "../db/connection";
import { defineAppHandler } from "../mozaik/app-events";

/** In-process fan-out of persisted events to SSE subscribers. */
export class EventHub {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(event: AgentEvent): void {
    this.emitter.emit(event.sessionId, event);
  }

  subscribe(sessionId: string, listener: (event: AgentEvent) => void): () => void {
    this.emitter.on(sessionId, listener);
    return () => this.emitter.off(sessionId, listener);
  }
}

const allAppEventTypes = Object.keys(eventPayloadSchemas) as AppEventType[];

/**
 * Persistence/activity observer. Joined first so that, with synchronous SQLite writes,
 * every session-scoped event is stored with its sequence before other participants react.
 * It never mutates rules or findings.
 */
export function createObserver(db: Db, hub: EventHub): Human {
  const sessionExists = db.prepare("SELECT 1 FROM sessions WHERE id = ?").pluck();
  const insert = db.transaction((event: AgentEvent) => {
    const next = db.prepare(
      "SELECT COALESCE(MAX(sequence), 0) + 1 FROM agent_events WHERE session_id = ?",
    ).pluck().get(event.sessionId) as number;
    const stored = AgentEventSchema.parse({ ...event, sequence: next });
    db.prepare("INSERT INTO agent_events (id, session_id, sequence, data) VALUES (?, ?, ?, ?)")
      .run(stored.id, stored.sessionId, stored.sequence, JSON.stringify(stored));
    return stored;
  });

  return createHuman({
    name: "Activity Observer",
    capabilities: ["persist-events"],
    handlers: [
      defineAppHandler({
        types: allAppEventTypes,
        handle(event, { producerId }) {
          if (!event.sessionId || !sessionExists.get(event.sessionId)) return;
          const stored = insert({
            id: event.eventId,
            sessionId: event.sessionId,
            projectRevision: event.projectRevision,
            sequence: 1,
            type: event.type,
            producerId,
            payload: event.payload,
            occurredAt: event.occurredAt,
          });
          hub.publish(stored);
        },
      }),
    ],
  });
}

export function listSessionEvents(db: Db, sessionId: string, after: number): AgentEvent[] {
  return db.prepare("SELECT data FROM agent_events WHERE session_id = ? AND sequence > ? ORDER BY sequence")
    .pluck().all(sessionId, after)
    .map((row) => AgentEventSchema.parse(JSON.parse(row as string)));
}
