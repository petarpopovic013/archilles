import { randomUUID } from "node:crypto";
import {
  SemanticEvent,
  SituationSpecification,
  type Participant,
  type SituationContext,
  type SituationHandler,
} from "@mozaik-ai/core";
import {
  eventPayloadSchemas,
  parseAppEvent,
  type AppEvent,
  type AppEventType,
} from "../../src/domain";
import { resolveRuntime, sendEvent } from "./runtime";

export interface EventScope {
  projectId: string;
  projectRevision: number;
  correlationId: string;
  sessionId?: string;
}

/** Builds and validates an application envelope before it is published. */
export function createAppEvent<T extends AppEventType>(
  type: T,
  scope: EventScope,
  payload: AppEvent<T>["payload"],
): AppEvent<T> {
  return parseAppEvent({
    eventId: randomUUID(),
    type,
    ...scope,
    occurredAt: new Date().toISOString(),
    payload,
  }) as AppEvent<T>;
}

/** Publishes an application event through Mozaik with the joined participant as producer. */
export function emitAppEvent(producer: Participant, event: AppEvent): void {
  sendEvent(SemanticEvent.create(event.type, producer.getId(), event), producer.getId());
}

export function isAppEventType(type: string): type is AppEventType {
  return Object.hasOwn(eventPayloadSchemas, type);
}

class AppEventTypeSpecification extends SituationSpecification {
  constructor(
    private readonly types: ReadonlySet<string>,
    private readonly producerIds?: () => readonly string[],
  ) {
    super();
  }

  isSatisfiedBy({ event }: SituationContext): boolean {
    if (!this.types.has(event.type)) return false;
    return !this.producerIds || this.producerIds().includes(event.producerId);
  }
}

export interface AppHandlerContext {
  participant: Participant;
  producerId: string;
}

export interface AppHandlerOptions<T extends AppEventType> {
  types: readonly T[];
  /** Restricts accepted producers; resolved lazily because participants join after creation. */
  producerIds?: () => readonly string[];
  handle(event: AppEvent<T>, context: AppHandlerContext): void | Promise<void>;
  onError?(error: unknown, event: AppEvent<T>, context: AppHandlerContext): void;
}

/**
 * Wraps an application handler for Mozaik's synchronous, non-awaited fan-out:
 * defers one microtask so other participants see the event first, validates the envelope,
 * drops duplicate deliveries, and never lets a rejection escape (it would crash the process).
 */
export function defineAppHandler<T extends AppEventType>(options: AppHandlerOptions<T>): SituationHandler {
  return {
    specification: new AppEventTypeSpecification(new Set(options.types), options.producerIds),
    processor: {
      async apply({ event, participant }) {
        await Promise.resolve();
        let appEvent: AppEvent<T>;
        try {
          appEvent = parseAppEvent(event.payload) as AppEvent<T>;
          if (appEvent.type !== event.type) throw new Error("Envelope type does not match event type");
        } catch {
          console.error(`[runtime] rejected malformed ${event.type} from ${event.producerId}`);
          return;
        }
        const dedupeKey = `${participant.getId()}:${appEvent.eventId}`;
        const processed = resolveRuntime().state.processedEvents;
        if (processed.has(dedupeKey)) return;
        processed.add(dedupeKey);

        const context = { participant, producerId: event.producerId };
        try {
          await options.handle(appEvent, context);
        } catch (error) {
          try {
            if (options.onError) options.onError(error, appEvent, context);
            else console.error(`[runtime] ${appEvent.type} handler failed: ${errorCode(error)}`);
          } catch {
            console.error(`[runtime] ${appEvent.type} error handler failed`);
          }
        }
      },
    },
  };
}

/** Logs carry codes, not messages that might contain document text. */
export function errorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}
