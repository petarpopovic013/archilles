# Archilles

Archilles reviews architectural drawings against source-backed rules. Geometry and AI suggestions remain preliminary until a person confirms the relevant evidence; numerical rule outcomes come from the deterministic engine.

Install dependencies with `npm install`, configure server credentials in `.env` using `.env.example`, and run `npm run dev`. Open the local address printed by Next.js. The runtime migrates the local SQLite database automatically. Uploads and the database remain private under `data/`.

Upload a clean digital PDF, PNG or JPEG and select its page. Geometry first prepares examples of the drawing's symbols. Confirm the units you actually know and any recognized conventions, then continue detailed reading. Unknown units can remain unknown. The viewer shows suggested rooms/openings, dimension annotations and review issues. Use **Edit boundary**, **Add element**, or **Remove incorrect element** to correct the result. Two-point calibration records a known span; it does not approve every dimension. Confirm clear widths separately from nominal opening marks.

Existing projects reuse their observations. **Read geometry again** explicitly starts another paid extraction and preserves human corrections. Boundary changes, measurement corrections and hypothetical rechecks reuse stored geometry. A partial report lists the regions or geometry that still need attention. Complex walls, furniture touching walls and open-plan zones can still require manual correction; automatic recognition has not passed the full accuracy targets in the [recognition plan](docs/geometry-recognition-plan.md).

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

The evaluation reference must describe the SAME drawing as the observations. The bundled recognition references are development drafts, not human-verified ground truth. Benchmarks save private observations and overlay images outside public assets; review those overlays as well as any metrics. Budget is capped at $1 per page task ($0.80 Vision, $0.20 controller), including its confirmation continuation; explicit rereading starts a new task within the configured total/hourly limits. At most four logical Vision calls and one shared transient retry are allowed per task.

Architecture and contracts: [product](Constitution/PrD.md), [technology](Constitution/Tech.MD), [domain/database](Constitution/DB.md), [agent instructions](Agents.MD), [team agreement](TEAM.md), [geometry details](src/geometry/README.md).
