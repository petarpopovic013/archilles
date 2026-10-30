# Team 2 integration handoff

Import `prepareDrawingPage`, `analyzeDrawing`, `loadConfirmedFixture`, and correction helpers from this directory. Import browser-safe coordinate helpers directly from `transforms.ts`; do not bundle the server barrel into the viewer. Canonical entities come from `src/domain`.

## Preparation and rendering

The runtime injects private byte reads/writes. Never expose storage references to the browser. Validate the original upload with `prepareDrawingPage` before analysis. Limits: 20 MiB original, 20 pages, 40 million decoded pixels, 2048-pixel maximum analysis edge. The source frame is the orientation-normalized image, or PDF crop rendered at 144 DPI with intrinsic rotation applied. PDF.js uses 72-point page units; the renderer uses scale 2. Images retain their oriented native dimensions. The transform maps source pixels to analysis raster pixels; its inverse maps model geometry back. UI zoom/pan is a separate transform.

`createBrowserPageRenderer` in `browser-renderer.ts` implements the constitution's browser rendering requirement using PDF.js and browser canvas. Team 1 must configure `GlobalWorkerOptions.workerSrc` to a bundled worker of the same installed PDF.js version. EXIF orientation is applied by `createImageBitmap`. Header-only inspection validates PNG/JPEG dimensions and EXIF orientation before decoding; all eight TIFF orientations use the oriented source frame. Image DPI is omitted because it is not physical scale evidence. PDF passwords/corruption are rejected with distinct sanitized errors; password rejection settles promptly, and loading tasks are destroyed on success and failure. The optional `loadPdf` seam supports parser testing without browser canvas.

`createNodePageRenderer` in `node-renderer.ts` is the runtime preparation adapter (Tech ADR-08). It uses pinned direct dependencies Sharp and native canvas, plus the Node-compatible PDF.js legacy build. The runtime privately decodes originals, applies EXIF rotation/mirroring, resizes large images, and rasterizes only the selected PDF page. Native pixel tests check crop/rotation alignment. `runtime/main.ts` now supplies this renderer; the old PNG passthrough exists only for isolated tests. The browser renderer remains available for the viewer and never establishes trusted physical measurements.

## Vision and coordination

Create `createClaudeVisionRunner(serverOwnedClient, configuredModel)` in `src/vision/claude.ts`. Credentials stay inside the injected SDK client. The SDK is configured per request with automatic retries disabled and a 60-second timeout; the adapter permits one transient retry. Structured output uses the installed SDK's Zod output helper. No model is hardcoded. `reserveBudget` must atomically reserve enough for both possible calls; adapter usage reports provider tokens, while Team 3 calculates dollars from configured pricing.

Supply a cache scoped to private runtime storage. The cache key contains project/drawing/revision/floor identity, content hash, page, preprocessing/model/prompt versions and coordinate transform. Concurrent calls using the same cache instance share work. Failed results are not cached. The runtime must independently reject stale revisions before persisting results and emit real start/completion/failure events. This module does not publish events or persist entities.

AI dimensions are always unverified. Missing-input keys are element/metric within the supplied revision. Explicit labels retain raw text evidence and original units. Route lengths are withheld without a graph. When confirmed elements exist for a floor, those observations are authoritative and new suggestions are withheld rather than automatically duplicating or matching them. A future explicit merge UI can relax this policy.

`correctMeasurement` creates replacement measurement/evidence records; it does not commit revisions. Team 3 must validate the current base revision and transactionally persist revision, evidence and replacement. A hypothetical recheck bypasses these functions and Vision entirely.

## Synthetic demo

Call `loadConfirmedFixture(parsedJson, context)` explicitly with either `fixtures/plans/office-a.json` or `office-b.json`. These are authored synthetic observations, not real architect approvals or regulatory requirements. Display the returned disclosure warning. The JSON geometry refers to the corresponding 800×600 PNG/JPG, not to the PDF render. The two-page PDF is an independent normalization fixture; its source frame is 1600×1200. Fixtures contain no findings or rule thresholds. The engine computes all outcomes.

Optional asset regeneration uses `fixtures/plans/generate.mjs`. It uses the pinned direct `@napi-rs/canvas` dependency. Committed raster/PDF assets need no generator at runtime.

## Verification and remaining gates

- Normal tests use real image/PDF normalization and injected inference. They cover both PNG/JPG fixture pairs, all eight EXIF orientations, malformed frames/EXIF, size limits, selected PDF pages, crop/rotation pixel alignment, and PDF failure cleanup.
- The HTTP/Mozaik integration test uploads PNG, JPG, and PDF through private storage, extracts with mocked Vision, confirms dimensions, and computes deterministic before/after results. Its synthetic rule is test-only and asserts no Serbian requirement.
- The viewer HTTP client uses validated source-dimension headers, including when a 4000×3000 source is served as a 2048×1536 raster. It never invents an overlay frame. Late geometry results are checked against the live project revision before persistence. Vision calls for multiple pages in one project are serialized. Token usage is retained for billable invalid responses and for late results discarded after a revision change; budget reservations remain held until the run ledger is updated. Corrected measurements reuse stored geometry; hypothetical rechecks make no model call.
- `npm run smoke:geometry` explicitly runs the actual local HTTP/Mozaik/Vision path on `office-a.png`, with an isolated temporary database and at most USD 1 reserved from the configured budget. It deletes its local data afterward and prints only sanitized counts, token usage, costs and error codes. It uses no active rules, so a successful extraction still claims no regulatory coverage. It is excluded from `npm test`.
- Live smoke (30 October 2026) now passes with `claude-sonnet-4-6`: session COMPLETE, 5 suggested elements, 2 UNVERIFIED measurements, 3 reported input tokens, 427 output tokens, estimated cost USD 0.006414, and zero active rules. The HTTP/Mozaik/private-rendering path used only the synthetic office fixture. This verifies provider wiring and canonical output, not measurement accuracy or legal compliance.
- Earlier HTTP 503 responses were diagnosed as Mozaik Cloud rejecting the previous default model `claude-opus-5-5`, not a confirmed service outage. Runtime/example defaults now use the gateway-verified Sonnet model. A known unsupported-model response reports `PROVIDER_MODEL_UNAVAILABLE` without retrying; unknown 503 responses still receive the bounded transient retry. Model-list HTTP 404 alone is not an availability check.
- Browser visual rehearsal remains unverified because no browser connection was available. Native raster pixel alignment is tested, but UI zoom/pan and hit testing still require Team 1's viewer.
- Production uses Team 4’s source/registry/applicability modules through `runtime/adapters/registry.ts`. No delivered rule is ACTIVE, so production still executes zero legal checks; reviewed rules retain their lifecycle gates. Coverage exposes the source and review counts; no test threshold is installed in the application.


## Mozaik tool-loop integration

Geometry now starts `runLoop` with a private batch context and the registered `extract_drawing_page` tool. The tool calls `analyzeDrawing` and the existing server-side Vision adapter; only validated extraction records can be persisted. The controller receives counts/types, not pixels or storage paths. Cached observations bypass both controller and Vision calls.

Regulation uses `runLoop` with `read_applicable_rules`. Its read-only tool supplies the registry's deterministic applicability proposal plus active rule metadata. Model explanations must reference the exact proposed IDs. The pure engine still checks inputs/applicability and alone assigns evaluation status. Selection caches are scoped to project, controller version, rule-set, classification facts and element confirmation/type/subtype; changing only a dimension reuses selection.

Both controllers allow one tool call and two inferences, use isolated contexts, validate tool batch IDs, and reserve budget before inference. Per-request provider timeouts/retries remain bounded. SQLite stores native loop IDs and state names in `agent_loop_events`, with no raw context or answers. The application activity stream continues to use persisted domain transitions. Stale Geometry/Regulation results are rejected; late Review output cannot revive stale findings. The SDK wrapper now accepts legitimate tool-call-only inference responses and rejects multiple calls or tool calls from tool-less tasks.

Run `npm run smoke:geometry -- --synthetic-rule` to exercise all three live loops with an invented test-only threshold in isolated temporary storage. This never changes the production registry. Verified live result: COMPLETE; Geometry 1 loop, Regulation 2 loops, Review 1 loop; 5 elements and 2 UNVERIFIED measurements; aggregate estimated USD 0.022815. The default smoke still uses an empty registry and claims no legal coverage.
