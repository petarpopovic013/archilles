# Archilles: four-person implementation agreement

This is the handoff for the October 30–31 hackathon. Each person takes one branch and uses one coding agent on that branch. Read `Agents.MD` and `Constitution/` first. Branch names identify responsibilities; assign actual names in your team chat. The P0 target remains 3–5 human-verified checks across Serbian fire and accessibility sources, using a real 2D drawing, real Mozaik events, deterministic evaluation, visible findings, and hypothetical Fix & Recheck.

## Exact ownership

| Person and branch | Files owned exclusively | Deliverable and acceptance |
|---|---|---|
| **1 — Workspace** `feat/workspace-ui` | `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `src/ui/**`, `public/**`, `tests/ui/**` | Three-panel project workspace. Upload and page selection; zoom/pan plan viewer with stable overlays; element/finding/source panels; confirmation and Fix & Recheck controls; coverage and real SSE activity. Two fixture projects render correctly. No hardcoded finding status or fake agent timeline. |
| **2 — Geometry + Vision** `feat/geometry-vision` | `src/geometry/**`, `src/vision/**`, `fixtures/plans/**`, `tests/geometry/**` | Validate and normalize PDF/PNG/JPG pages; source-pixel coordinates and scale evidence; Claude Vision suggestions; stable element IDs, measurements, and evidence; clear uncertainty and user-correction handling. Provide two different safe plan fixtures. Pure coordinate/unit tests pass; uncertain pixels never become verified metres. |
| **3 — Runtime + integration** `feat/rules-runtime` | `src/domain/**`, `src/rules/engine/**`, `runtime/**`, `app/api/**`, `tests/engine/**`, `tests/runtime/**`, `package.json`, `package-lock.json`, root build/config files | Shared Zod/types first; persistent Mozaik process; Geometry, Regulation, and Review participants with real events/shared state; SQLite/upload storage; HTTP/SSE API; pure deterministic rule evaluation and revision-aware recheck. Integration test proves overlapping agents and data-dependent outcomes. |
| **4 — Regulatory intelligence** `feat/regulatory-intelligence` | `src/rules/registry/**`, `src/rules/applicability/**`, `src/rules/sources/**`, `fixtures/regulations/**`, `tests/regulatory/**`, `docs/regulations/**` | Verify official Serbian source versions, exact provisions, scope, exceptions, and measurements. Deliver versioned rule registry, pure rule selection/applicability, 3–5 human-reviewed rule fixtures across both source families, source dossier, and pass/fail/boundary/missing/non-applicable tests. Candidates never become active by AI consensus. |

`app/api/**` belongs to Person 3 even though it sits under `app/`. Within `src/rules/**`, Person 3 owns only `engine/**`; Person 4 owns only `registry/**`, `applicability/**`, and `sources/**`. Do not create or edit a shared `src/rules/index.ts`; import the owned modules directly. Do not run a repository-wide formatter or change another person's files to make your branch compile. `Constitution/**`, `Agents.MD`, `TEAM.md`, and `.github/**` are shared governance files: change them only in a small separate PR agreed by the team.

Person 3 is the only owner of dependency and lockfile edits. Persons 1, 2, and 4 send package requests with exact names and reasons; Person 3 adds dependencies in the first contract PR. Do not run `npm install --save` independently on feature branches. Local experiments may use uncommitted installations, but submitted code must build from the committed lockfile.

## Frozen handoff contracts

**C0: contract PR first.** Person 3 publishes `src/domain/**` with the `DB.md` types and Zod schemas, typed endpoint request/response shapes from `Constitution/Tech.MD`, and typed application event envelopes from `Agents.MD`. This PR contains no large feature. Merge it to `main` immediately after review; all four people then update their branches. Until C0 merges, the other three work with fixture data shaped exactly like `DB.md`. Never invent duplicate status enums or entity interfaces.

**Person 2 -> Person 3:** export `prepareDrawingPage(input): Promise<PreparedPage>` and `analyzeDrawing(input): Promise<GeometryExtraction>` from `src/geometry/`. `PreparedPage` carries drawing/page identity, normalized dimensions, raster reference, and coordinate transform. `GeometryExtraction` carries validated `ArchitecturalElement[]`, `Measurement[]`, `Evidence[]`, missing-input requests, warnings, and model usage. It does not contain legal or compliance conclusions. Person 3 invokes it from the Mozaik Geometry participant and persists its output.

**Person 4 -> Person 3:** export `getActiveRules(sourceVersionDate)` and `selectApplicableRules(project, elements, rules)` from `src/rules/registry/` and `src/rules/applicability/`. Selection returns rule IDs, explanations, and missing context; it does not return `PASS`/`FAIL`. Each active rule carries official source/provision/version, human reviewer record, bounded evaluator definition, and test fixtures. Person 3's engine independently verifies applicability and inputs before evaluation. If source or interpretation is unresolved, the rule remains inactive or produces `NEEDS_REVIEW` through a reviewed path.

**Person 3 -> Person 1:** implement the endpoints in `Constitution/Tech.MD`, including project/drawing creation, analysis state, private page retrieval, measurement correction, hypothetical recheck, coverage, and ordered SSE events. Person 1 uses one typed client in `src/ui/api/` and may mock responses locally until the API PR merges. The UI reads finding statuses from the engine response and displays stored agent events; it never computes legal outcomes or manufactures progress.

Only the engine produces `PASS`, `FAIL`, `UNKNOWN`, `NOT_APPLICABLE`, `NEEDS_REVIEW`. Rule lifecycle is `CANDIDATE`, `AI_REVIEWED`, `HUMAN_VERIFIED`, `ACTIVE`, `REJECTED`, `SUPERSEDED`. A confirmed correction creates a project revision; a proposed Fix & Recheck does not edit the drawing or create a confirmed measurement. Contract changes require a tiny PR to `main`, advance notice to all owners, and updated fixtures. Prefer additive optional fields while integration is in progress.

## Work order and merge checkpoints

| When | Person 1 | Person 2 | Person 3 | Person 4 | Merge gate |
|---|---|---|---|---|---|
| **Day 1, first work block** | Three-panel static workspace and typed mock client | Page normalization and two plan fixtures | C0 shared schemas, package additions, API/event types | Official source dossier and candidate check matrix | Merge C0 before coupling modules. |
| **Day 1, remaining work** | Viewer, overlays, findings, recheck form | Vision adapter, evidence extraction, correction helpers | Runtime shell, SQLite, API/SSE, pure engine | First verified fire and accessibility rules, applicability and tests | Merge small PRs independently when owned tests pass. |
| **Day 2, first half** | Replace mocks with live API; handle loading/error/unknown states | Integrate real drawing output and confirm alignment | Wire agents to geometry and registry; complete recheck | Reach 3–5 verified checks; coverage counts and legal review | One end-to-end project/drawing/recheck flow on `main`. |
| **Day 2, final block** | Demo UI polish and accessibility | Second drawing and failure-path rehearsal | Cost cap, event trace, restart/error tests | Source citations and uncertainty audit | Fresh-clone demo, CI green, no unmerged critical feature. |

**C1 vertical slice:** one confirmed fixture measurement -> Mozaik Geometry/Regulation activity -> selected active rule -> deterministic evaluation -> API -> visible element finding -> hypothetical recheck. **C2 real drawing:** PNG/JPG and selected PDF page align with overlays; uncertain Vision output can be corrected. **C3 breadth:** 3–5 active checks span both regulations with tests and coverage gaps. **C4 demo:** two plans give different outcomes; the live path and disclosed confirmed-fixture fallback both work. Merge C1 early; do not wait for all agents to finish their entire branches.

If time is tight, drop broad extraction UI, PDF export, accounts, cloud hosting, multi-floor analysis, and additional visual polish before dropping C1, source verification, or real Mozaik collaboration.

## Git and coding-agent synchronization

1. Each person checks out only their assigned branch, pushes an early **draft PR to `main`**, and records current exports/API shape there. AI coding agents should be told their branch, owned paths, forbidden paths, and handoff contract from this file.
2. Before a new work block and after any merge, run `git fetch origin` and integrate `origin/main` into your branch. Rebase only if you alone use that branch, then push with `--force-with-lease`; otherwise merge `origin/main`. Never force-push `main` or another person's branch.
3. Merge C0 first. After that, keep PRs small and merge owned modules as soon as contracts and tests pass. Person 3 integrates, but does not edit Persons 1, 2, or 4's modules. Cross-module fixes go to the owner in a separate PR.
4. Each PR lists files owned, changed contracts, real tests run, and a screenshot or event trace where relevant. One other person reviews it; CI must pass. New active rules require a link to the official provision, recorded human review, and pass/fail/boundary/missing/applicability tests.
5. If agents propose edits to the same file, stop and assign one owner. Exchange a requested interface change through the draft PR or team chat. Do not let two agents independently repair the same conflict. Never commit `.env`, confidential plans, `data/`, `.next/`, or raw AI logs.

The final demo runs from `main`, with all four owned parts merged. Four branches reduce file conflicts; stable contracts and frequent integration reduce semantic conflicts.
