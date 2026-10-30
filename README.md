# Archilles

**Find the weakness before it becomes a risk.** Archilles is a hackathon prototype for source-backed, preliminary review of 2D architectural plans in Serbia. It is not a permit or professional certification. The application is currently a Next.js starter; implementation is split across four feature branches.

Start with the [team work agreement](TEAM.md), then read [product requirements](Constitution/PrD.md), [technical architecture](Constitution/Tech.MD), [agent instructions](Agents.MD), and [data contracts](Constitution/DB.md). Each branch has a distinct file owner. Changes are integrated into `main` through small reviewed pull requests.

The shared C0 types, validators, endpoint shapes, event payloads, and contract-only fixture live in [`src/domain/`](src/domain/README.md). `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` verify this foundation. No legal rule or application workflow has been implemented yet.

The first demo target is confirmed plan geometry, an active verified rule, a deterministic evaluation, a visible finding, and hypothetical Fix & Recheck. Legal source and measurement uncertainty must remain visible throughout the workflow.
