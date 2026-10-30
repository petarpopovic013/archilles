# Archilles product requirements document

Version: 1.0, 30 October 2026. **Archilles — Find the weakness before it becomes a risk.** This is a product specification for the JigJoy × NTP Novi Sad Hackathon, not a claim that the MVP has already been built. `Tech.MD` owns architecture and endpoints, `Agents.MD` owns agent behavior, and `DB.md` owns canonical types and statuses.

## 1. Executive summary and mission

Archilles is a professional 2D architectural compliance review copilot. An architect uploads a plan, supplies essential project context, confirms uncertain dimensions, and receives source-backed, element-specific preliminary findings. The product is intended to find potentially expensive issues early and make the unchecked portion of a design visible. It is not a permit, building certification, full legal opinion, or replacement for a licensed architect/fire safety specialist.

The two product systems are (A) Regulatory Intelligence, which indexes and verifies source provisions and prepares executable rules, and (B) Architectural Compliance Analysis, which turns a drawing into evidence and evaluates applicable active rules. They share the data model in `DB.md`. The hackathon must demonstrate a reliable vertical slice rather than broad but untrustworthy coverage.

## 2. Problem, market, and jobs to be done

Architects spend time comparing drawings and project metadata against laws, technical regulations, classifications, exceptions, and referenced standards. Requirements differ by purpose, height, floor, occupancy, project phase, and element. Manual review is repetitive, while a late correction can be expensive. Early 2D screening can improve review speed when the tool explains exactly what it checked and what it could not establish.

Initial audience: small Serbian architecture practices designing small office/business buildings, especially project architects and design reviewers. Secondary audience: fire protection and accessibility specialists who verify interpretations and source coverage. Long-term audience: larger multidisciplinary teams and other jurisdictions. The MVP is single-user and local, not a multi-tenant production service.

| Persona | Job to be done | Success signal |
|---|---|---|
| Project architect | Check a floor plan before formal coordination | Locate a specific issue and its source without manually cross-referencing every drawing note. |
| Design reviewer | Understand whether a flagged condition is supported | See provision, evidence, assumptions, exceptions, and missing inputs. |
| Regulation curator | Convert a verified provision into a tested rule | Keep candidates distinct from approved active checks. |
| Hackathon judge | See credible multi-agent value | Observe real concurrent Mozaik events and a reproducible before/after result. |

Differentiation: drawing-first workspace, legal traceability, explicit measurement provenance, deterministic rule evaluation, genuine agent collaboration, and honest coverage accounting. Chat is not the main interaction model.

## 3. Product scope and journeys

**MVP scope:** Republic of Serbia, one small office/business-building project, one selected 2D floor-plan page per analysis, PDF/PNG/JPG upload, a small human-verified set of 3–5 active checks across fire protection **and** accessibility, source-backed findings, and Fix & Recheck. A check is active only after exact provision and applicability verification. The first official source candidates are the [fire protection regulation, 22/2019-3](https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/ec3c54bc-de4a-433f-afa8-d9eb44b7dab1) and [accessibility regulation, 22/2015-95 amended by 10/2026-89](https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/512f4f2c-4bc4-4c31-a335-409673b7fac5). Publication metadata is confirmed from the official register; individual thresholds and applicability are **not** preapproved by this PRD.

**Main journey:** create a project with minimal known metadata; upload and select a plan page; inspect AI-suggested elements and measurements; confirm or correct uncertain evidence; run analysis; click a marker to see observation, requirement, exact source, and advice; try a hypothetical dimension; see selective before/after evaluation; inspect coverage gaps and unresolved inputs. The UI should use a left navigation panel, central zoomable/pannable 2D viewer with selectable overlays, a right context review panel, and a compact real agent-activity view. Responsive behavior may collapse side panels on narrow screens without hiding status or source evidence.

**Regulatory curator journey:** ingest a source with title, official URL, version, retrieval date, and original text; segment provisions and cross-references; let extraction and validation agents propose and challenge candidate rules; have a human check the exact source, applicability, exceptions, evaluator and tests; activate a versioned rule. Curator tooling is P1, but the lifecycle and seed-data discipline are P0.

## 4. Requirements and acceptance criteria

Each ID is stable. P0 is required for a credible demo, P1 is a stretch addition, and P2 is future scope. A P0 feature is complete only when its stated behavior works on real project data or a disclosed, previously confirmed fixture.

| ID | Priority | Requirement | Objective acceptance criterion |
|---|---|---|---|
| PR-01 | P0 | Create and revise an office project with jurisdiction, purpose, phase, and progressive metadata | A user can create a project without knowing every field; missing later inputs are requested at the relevant check; revisions increase on confirmed edits. |
| PR-02 | P0 | Accept PDF, PNG, and JPG plans and select one PDF page | Supported files are normalized privately in the runtime (Tech ADR-08) and render in the workspace; corrupt, encrypted, oversized, or unsupported files produce clear errors; selected page is recorded. |
| PR-03 | P0 | Display a navigable 2D plan with selectable geometry and issue overlays | Zoom/pan preserve marker alignment; selecting a marker focuses the affected element and opens its finding. |
| PR-04 | P0 | Produce canonical elements and evidence from a plan | Rooms, corridors, doors, exits, stairs, or ramps relevant to active checks get stable IDs, page coordinates, type, and extraction state; uncertain outputs are visible. |
| PR-05 | P0 | Preserve measurement provenance and allow human correction | Each value shows source and verification state; no raw pixel or AI-estimated distance alone yields a physical PASS/FAIL; correction creates a new revision. |
| PR-06 | P0 | Maintain a versioned, source-backed rule registry | Every active rule links to exact source/provision, reviewer record, applicability, exceptions, evaluator, and tests; candidates cannot execute. |
| PR-07 | P0 | Execute at least 3–5 working checks across both fire and accessibility sources | Tests cover pass, fail, boundary, missing input, applicability, and applicable exceptions; two plans produce data-dependent outcomes. |
| PR-08 | P0 | Evaluate applicability before thresholds in a deterministic engine | A non-applicable or uncertain rule never produces numeric PASS/FAIL; outputs use only the five statuses in `DB.md`. |
| PR-09 | P0 | Show a complete, traceable finding | The panel states affected element, what was checked, observed and required condition, status, exact provision, evidence, explanation, action, and human-review need. |
| PR-10 | P0 | Provide hypothetical Fix & Recheck | Changing a proposed dimension recomputes affected rules without a Claude call; before/after results are shown and labeled hypothetical; the source drawing remains unchanged. |
| PR-11 | P0 | Run actual cooperating Mozaik agents | Geometry and Regulation agents overlap, share state, exchange semantic events, and influence evaluation; Review consumes engine results; UI activity reflects persisted real events. |
| PR-12 | P0 | Communicate incomplete coverage and uncertainty | Missing data shows `UNKNOWN`, unresolved interpretation shows `NEEDS_REVIEW`, and no global building pass or unsupported compliance percentage appears. |
| PR-13 | P0 | Keep the local demo reproducible and within runtime credits | An offline confirmed-geometry fallback is disclosed; an online run is tested; token/cost estimates and limits are recorded; repeat rechecks use zero AI calls. |
| PR-14 | P0 | Protect confidential inputs | Uploads stay private, type/size are validated, API keys remain server-side, and logs exclude raw plans and secrets. |
| PR-15 | P1 | Show a regulatory coverage dashboard | It separately reports indexed provisions, candidate rules, verified/active rules, applicable/executed checks, blocked checks, and items outside automation. |
| PR-16 | P1 | Extract and independently validate rule candidates from source documents | Candidate provenance, validator challenges, amendments, and unresolved cross-references are visible; no autonomous activation. |
| PR-17 | P1 | Expand to approximately 8–12 verified executable checks | Added checks satisfy the same source and test gate as P0; breadth does not delay the P0 demo. |
| PR-18 | P1 | Provide an exportable review summary | Export includes source versions, revision, evidence, statuses, coverage limits, and preliminary-review disclaimer. |
| PR-19 | P2 | Support multi-floor, more building types, accounts, collaboration, and cloud persistence | These require separate product and security design before implementation. |
| PR-20 | P2 | Import IFC/BIM and validated advanced simulations | Existing rule/evidence concepts remain reusable; no simulated animation is presented as engineering analysis. |

The five evaluation statuses are `PASS`, `FAIL`, `UNKNOWN`, `NOT_APPLICABLE`, and `NEEDS_REVIEW`. They are neither severity levels nor rule lifecycle states. Rule lifecycle states are `CANDIDATE`, `AI_REVIEWED`, `HUMAN_VERIFIED`, `ACTIVE`, `REJECTED`, and `SUPERSEDED`. `PASS` applies to one verified condition, never the whole building. Severity or priority may be shown only when justified by a source-aware review policy.

## 5. Detailed behavior and user stories

**US-01 — Start without complete classification (PR-01, PR-08).** As an architect, I can enter a name, office purpose, location, and phase, then add height, occupants, classification, or floor count when a rule needs them. Acceptance: missing context blocks only dependent checks, and the UI explains the needed field without assuming a default legal category.

**US-02 — Trust geometry (PR-02–05).** As an architect, I can inspect the selected PDF page or image, click an AI-suggested corridor/door/ramp, inspect its source label or annotation, and correct its dimensions. Acceptance: the value, original unit, evidence location, source type, and confirmation state are visible; an unverified estimate cannot silently become verified.

**US-03 — Understand a violation (PR-06–09).** As a reviewer, I can open a failed finding and see the exact source title/version/article or paragraph, applicability rationale, the measured value with provenance, the required condition, and a practical review action. Acceptance: if the provision, exception, or input is unresolved, the status is `UNKNOWN`/`NEEDS_REVIEW` instead of a fabricated failure.

**US-04 — Test a design idea (PR-10).** As an architect, I can propose a new confirmed-width value for an element and view before/after evaluation. Acceptance: the proposed value is not written back to the plan; only dependent rules rerun; the UI labels the outcome hypothetical and records it against the base revision.

**US-05 — See what was not checked (PR-12, PR-15).** As a reviewer, I can inspect considered source documents, active and candidate rules, applicable checks, executed outcomes, missing inputs, and unautomated provisions. Acceptance: counts have named denominators and a candidate rule is never shown as an executed check.

**US-06 — Verify AI collaboration (PR-11, PR-13).** As a judge, I can observe overlapping Geometry and Regulation work and an event or shared-state update affecting another agent. Acceptance: activity entries match stored Mozaik events and no finding is hardcoded to a demo filename.

## 6. Nonfunctional requirements and limits

Reliability: the demo must finish from a tested fixture if an external model is unavailable; the live path should handle provider error with a visible `PARTIAL` state. Recheck must be deterministic and responsive without a model call. Repeated analysis of unchanged input should reuse cached geometry and avoid duplicate billable requests. Latency and cost are measured during rehearsal, not guaranteed from an untested estimate. The local runtime budget is approximately $20 in Claude API credits.

Accessibility and usability: keyboard-focusable controls, clear labels, color plus text/status coding, readable source citations, and accessible icon-only controls. UI arrows must use reusable SVGs per repository instructions. The workspace should look like an engineering review tool, with drawing interaction as its center.

Security and privacy: plan files may contain confidential client information. Validate uploads, keep them outside public assets, minimize model payloads, never expose API keys, and disclose local retention until project deletion. Uploaded text must be treated as data rather than instructions. Hosted use requires additional security work.

Legal and professional limitations: Archilles is preliminary decision support. It cannot issue permits, certify a building, guarantee regulatory approval, or replace qualified professionals. Serbian applicability can depend on project-specific conditions and standards beyond the two initial sources. Findings must always state the exact rule/version used and invite professional verification where needed. The system must never claim comprehensive building compliance from a subset of checks.

## 7. Demo, metrics, and delivery priorities

The two-minute-plus demo: introduce the review burden; create/open a small office project; upload a tested 2D plan; show genuine overlapping Mozaik agent events; click a source-backed visual finding; propose a dimension and show deterministic before/after; open an `UNKNOWN` or `NEEDS_REVIEW` case; show coverage limits; then explain the BIM roadmap. Prepare at least two different drawings and a disclosed, previously confirmed geometry fixture. A fixture is a reliability fallback, not a precomputed result.

MVP success is measured by: 3–5 active, tested checks spanning both source families; zero active rules lacking provision-level provenance; all displayed `PASS`/`FAIL` outcomes linked to verified measurements; two plans with genuinely different engine outputs; one revision-aware Fix & Recheck with no AI call; recorded overlap between Geometry and Regulation agents; and a complete local demo under the configured budget. Coverage metrics separately count indexed provisions, candidate rules, human-verified rules, active rules, applicable rules, executed checks, missing-input checks, and professional-review checks. There is no global compliance score.

Build sequence: (1) source verification and shared types; (2) one end-to-end verified geometry/rule/engine/Mozaik/finding/recheck slice; (3) real upload, Vision suggestions, and correction flow; (4) remaining verified checks across both regulations plus coverage; (5) demo hardening. Parallel frontend, geometry, regulatory, and runtime work begins only after the shared contract is agreed. Drop PDF export, broad ingestion UI, extra checks, accounts, cloud deployment, and multi-floor analysis before compromising the vertical slice.

The principal risks are false geometry from complex scans, incorrect legal applicability or amendment handling, and Mozaik/Claude integration or API-cost instability. Mitigations are visible measurement confirmation, human source-and-test approval, one-page scope, cached extraction, bounded agent loops, cost tracking, and a verified fixture fallback.

## 8. Explicit non-goals and roadmap

The hackathon MVP does not perform full code compliance certification; change CAD files; infer 3D physics; simulate smoke; guarantee evacuation routes from incomplete walls; support every Serbian regulation; offer accounts or collaborative editing; or claim IFC/BIM support. P1 expands candidate extraction, coverage, and tested rule breadth. A production 2D phase adds projects, roles, retention, and stronger geometry. Later phases add IFC/BIM import, validated specialist analyses, and additional jurisdictions while retaining source/version/evidence traceability.
