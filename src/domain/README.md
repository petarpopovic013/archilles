# Shared C0 contracts

`src/domain/index.ts` is the only public import point for project, geometry, regulation, evaluation, API, and event types. Types are inferred from Zod schemas where possible. Browser and server code may import these schemas, but no runtime secret or database code belongs here.

- `project.ts`: project/drawing/floor/element/evidence/measurement schemas and geometry bounds helper.
- `regulation.ts`: source/provision/rule lifecycle, applicability condition DSL, and evaluator definitions. No legal rule is seeded here.
- `review.ts`: evaluations, findings, revisions, actions, sessions, and persisted agent records.
- `api.ts`: JSON request/response schemas and route contract map. Upload metadata is validated here; file signatures and bytes must be validated by the server. The page route returns binary data.
- `events.ts`: typed application event payloads and `parseAppEvent`. Mozaik transports these events; it does not define their names.
- `fixtures.ts`: contract-only examples for UI and integration scaffolding. They assert no actual Serbian requirement and must never be presented as a legal finding.

In project PATCH requests, `null` clears an optional metadata field or characteristic; omitted fields are unchanged. Persisted `Project` objects omit cleared optional fields. A confirmed correction increments the revision, while recheck input is hypothetical.

Use `npm test` for boundary tests, `npx tsc --noEmit` for type checking, and `npm run lint`. Cross-record checks such as project ownership, revision consistency, active-rule source verification, and drawing page relationships belong in the runtime persistence/engine layer. Do not treat a single Zod parse as proof of a regulation's correctness.
