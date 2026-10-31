# Archilles

Archilles reviews architectural drawings against source-backed rules. Geometry and AI suggestions remain preliminary until a person confirms the relevant evidence; numerical rule outcomes come from the deterministic engine.

Install dependencies with `npm install`, configure server credentials in `.env` using `.env.example`, and run `npm run dev`. Open the local address printed by Next.js. The runtime migrates the local SQLite database automatically. Uploads and the database remain private under `data/`.

On each laptop, run `npm run check:provider` to verify its credentials, endpoint and configured models with a tiny paid text request (no drawing is sent). `.env` is local and is not transferred by Git. For Mozaik gateway credentials, set `ANTHROPIC_BASE_URL=https://api.app.jigjoy.ai/gateway/anthropic`; a direct Anthropic key uses the default Anthropic endpoint. Restart `npm run dev` after changing `.env`. The check reports DNS, TLS, timeout and authentication failures without printing keys. `REVISION_SUPERSEDED` means the project changed during analysis; the old result is discarded, and a new revision's analysis waits for the old extraction to finish before proceeding.

Upload a clean digital PDF, PNG or JPEG and select its page. The initial project questions are unchanged. Recognition runs automatically: the drawing legend stays internal and never blocks the interface. AI suggests categories, reads dimension annotations and uses explicit units or supported drawing spans where available.

Findings distinguish confirmed outcomes from **AI estimates**. The deterministic engine can show a separate preliminary pass, potential issue or likely non-applicability using recorded assumptions. AI suggestions never become human confirmations. Unknown project facts, unresolved exceptions and unsupported evaluators remain unresolved.

Up to five short, optional questions appear one at a time on the plan. When choosing entrance doors, only candidate door overlays remain interactive. Measurements use a small input next to the element; calibration requests two points and a known distance only when needed. Skip a question or close the sequence to inspect findings immediately. Remaining uncertainties keep an action beside their finding. Answers and the five-question allowance survive refreshes and correction revisions.

Use **Adjust analysis** or select an element to correct units, categories and dimensions on the plan. The right sidebar is read-only. Boundary editing, adding/removing elements and hypothetical Fix & Recheck remain available. **Read geometry again** is under advanced settings and explicitly starts another paid extraction while preserving human corrections. Existing projects reuse their observations. Automatic recognition has not passed the full accuracy targets in the [recognition plan](docs/geometry-recognition-plan.md).

Normal checks run without provider access:

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Explicit paid checks use isolated temporary runtime databases and never activate regulations:

```sh
npm run smoke:geometry
npm run benchmark:geometry -- --plan fixtures/plans/residential-dimensioned.png --output /tmp/archilles-recognition
npm run evaluate:geometry -- /tmp/archilles-recognition/observations.json fixtures/plans/recognition-reference-drafts.json
```

The evaluation reference must describe the SAME drawing as the observations. The bundled recognition references are development drafts, not human-verified ground truth. Benchmarks save private observations and overlay images outside public assets; review those overlays as well as any metrics. Budget is capped at $1 per page task ($0.80 Vision, $0.20 controller), including any legacy confirmation continuation; explicit rereading starts a new task within the configured total/hourly limits. At most four logical Vision calls and one shared transient retry are allowed per task.

Architecture and contracts: [product](Constitution/PrD.md), [technology](Constitution/Tech.MD), [domain/database](Constitution/DB.md), [agent instructions](Agents.MD), [team agreement](TEAM.md), [geometry details](src/geometry/README.md).


Findings now request a required unit/known span before presenting numerical results. Repeated missing facts appear as up to five clarification groups; evaluated checks use Good/Fail. Once no in-scope clarification remains, **Summarise findings** opens a circular rating and the failed-check list. The rating includes its evaluated-check denominator and AI/excluded counts; it does not certify the whole building. Existing local databases are upgraded additively, including the missing review_rounds table repair.
