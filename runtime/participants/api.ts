import { createHuman, type Human } from "@mozaik-ai/core";

/** Human/API participant: HTTP commands enter Mozaik through it after schema validation. */
export function createApiParticipant(): Human {
  return createHuman({ name: "Archilles API", capabilities: ["user-commands"], handlers: [] });
}
