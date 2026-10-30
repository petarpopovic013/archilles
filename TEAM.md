# Archilles: three-person implementation agreement

This file is the handoff for the October 30–31 hackathon. Read `Agents.MD` and the documents in `Constitution/` first. All three feature branches start from the same foundation commit on `main`. Each developer uses one branch and one AI coding agent. Assign people to branches in your team chat; branch names describe work, not a person's identity.

## Shared delivery target

One office project and one selected floor-plan page produce a source-backed, element-linked finding through real concurrent Mozaik agents and a deterministic rule engine. A proposed dimension change produces a hypothetical before/after result without another model call. Target 3–5 human-verified rules across fire and accessibility. The demo must disclose unverified geometry and uncovered provisions.

## Ownership: no overlapping edits

| Branch / developer | Owns | Deliverable | Must not edit |
|---|---|---|---|
| `feat/workspace-ui` / Developer 1 | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `src/ui/**`, `public/**`, `tests/ui/**` | Three-panel workspace; project/upload flow; selected-page viewer with zoom/pan, element/finding overlays; source and measurement panels; Fix & Recheck form; real SSE activity and coverage states. | `app/api/**`, `src/domain/**`, `src/geometry/**`, `src/rules/**`, `runtime/**`, package manifests. |
| `feat/geometry-vision` / Developer 2 | `src/geometry/**`, `src/vision/**`, `tests/geometry/**`, `fixtures/plans/**` | File/page normalization helper; source-pixel coordinate model; Claude Vision adapter with strict output validation; element/measurement/evidence extraction; cache key; user-confirmation-aware geometry; at least two distinct plan fixtures. | `app/**`, `src/domain/**`, `src/rules/**`, `runtime/**`, package manifests. |
| `feat/rules-runtime` / Developer 3 | `src/domain/**`, `src/rules/**`, `runtime/**`, `app/api/**`, `tests/rules/**`, `tests/runtime/**`, `package.json`, `package-lock.json`, root tool config | Shared Zod/types first; official-source rule registry and 3–5 checked rules; deterministic applicability/evaluation; persistent Mozaik runtime, project/revision storage, API/SSE, and integration tests. | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `src/ui/**`, `src/geometry/**`, `src/vision/**`, `public/**`. |

`app/api/**` is the explicit exception to Developer 1's `app/**` ownership. Do not use a broad formatter that rewrites other owners' files. Developer 3 owns dependency changes; Developers 1 and 2 request new packages in a PR comment or team chat with exact package/version and reason. Developer 3 adds them in one lockfile change, merged early. Do not independently run `npm install --save` on three branches.

## Contract freeze and handoffs

**First integration checkpoint (within the first work block):** Developer 3 publishes `src/domain` Zod schemas and TypeScript exports matching `Constitution/DB.md`, plus typed endpoint/event names matching `Constitution/Tech.MD` and `Agents.MD`. Merge this small contract PR into `main` before substantial integration. Developers 1 and 2 can build against documented fixture objects meanwhile; then rebase on the contract commit. Do not invent a second `Project`, `Measurement`, `ComplianceRule`, `RuleEvaluation`, or status enum.

Developer 2 exports one server-only geometry entry point, `analyzeDrawing(input): Promise<GeometryExtraction>`, and pure normalization helpers. `input` contains drawing storage reference/page, image dimensions, project metadata, existing confirmed corrections, and an extraction cache key. `GeometryExtraction` returns validated `ArchitecturalElement[]`, `Measurement[]`, `Evidence[]`, warnings/missing input requests, and model usage. It never returns a compliance decision. Developer 3 calls this entry point from the Geometry participant and persists the output. A missing/ambiguous scale remains missing.

Developer 3 implements the API table in `Constitution/Tech.MD`; all browser requests go through `app/api/**`. Developer 1 consumes those routes with a single typed client in `src/ui/api/`, with fixtures only for local component work. SSE entries use the persisted `AgentEvent` envelope and ordered sequence; the UI never synthesizes progress. `POST /api/projects/:id/rechecks` is hypothetical, tied to `baseRevision`, and returns before/after evaluations. A real correction uses the measurement PATCH endpoint and creates a revision.

Developer 3's pure engine is the only producer of `PASS`, `FAIL`, `UNKNOWN`, `NOT_APPLICABLE`, and `NEEDS_REVIEW`. Developer 2 supplies evidence; Developer 1 displays status and provenance. Only `ACTIVE` rules with source/version/reviewer/test evidence may yield `PASS` or `FAIL`. Rule lifecycle uses exactly `CANDIDATE`, `AI_REVIEWED`, `HUMAN_VERIFIED`, `ACTIVE`, `REJECTED`, `SUPERSEDED`.

Any contract change goes through a small PR to `main` with the reason, changed schema/API/event, and fixture migration. Tell the other two developers before merging it. Prefer additive optional fields until the next integration checkpoint. Never quietly edit someone else's owned module to make your branch compile; create a focused integration PR or ask that owner to change it.

## Git and agent synchronization

1. Work only on your named feature branch. Push early and open a **draft PR to `main`** so the other two can see the interface and progress. A branch is not a shared live workspace: agent coordination comes from the frozen contracts, draft PRs, and frequent rebases.
2. Before each coding block and after a PR merges: `git fetch origin`, then `git rebase origin/main` on your own branch. Push your own rebased branch with `--force-with-lease` only if you alone use it; never force-push `main` or another person's branch. If your own branch is shared, merge `origin/main` into it instead of rebasing.
3. Keep PRs small: contract, then vertical feature, then polish. Merge the contract PR first; merge geometry/runtime integration before UI polish. Do not wait until the last hour to combine three large branches.
4. Each PR states owned paths, contract changes, real tests run, API/model cost where relevant, and a screenshot or event trace for UI/runtime behavior. Require one other teammate to review. Resolve CI failures before merge. A screenshot does not prove a regulation is correct; attach the official provision and reviewer record for a new active rule.
5. Do not commit `.env`, uploaded drawings from clients, `data/`, `.next/`, or agent logs with secrets. Use the ignored local `.env`; share only `.env.example`. The fixture plans must be licensed/public or team-created and stripped of client information.
6. If two agents need the same file, stop both edits, assign one owner, and have the second send a precise requested change. Use a tiny follow-up PR after the owner's change rather than resolving a large textual conflict at the end.

## Integration checkpoints

| Checkpoint | Done when | Owner leading |
|---|---|---|
| C0 — shared contract | Schemas compile; example project/geometry/evaluation fixtures validate; package dependencies and local commands are agreed. | Developer 3 |
| C1 — vertical slice | One confirmed fixture measurement flows through Mozaik events, active rule, pure engine, API, UI marker, and deterministic recheck. | Developer 3 + Developer 1 |
| C2 — real drawing | PNG/JPG and selected PDF page show aligned overlays; Vision suggestion can be inspected/corrected; two fixtures differ. | Developer 2 + Developer 1 |
| C3 — legal breadth | 3–5 verified/tested rules span both source families; missing inputs and coverage gaps are visible. | Developer 3 |
| C4 — demo | Fresh clone runs locally; live and disclosed fallback flows rehearse; no fabricated events/findings; cost stays within budget. | All three |

If time becomes tight, drop broad rule ingestion, export, accounts, cloud deployment, multi-floor analysis, and visual polish beyond usable overlays. Keep C1 and the source verification gate. Merge completed PRs to `main` at each checkpoint; the final demo runs from `main`, not a developer's unmerged branch.
