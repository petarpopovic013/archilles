# Team 2 integration handoff

Import `prepareDrawingPage`, `analyzeDrawing`, `loadConfirmedFixture`, and correction helpers from this directory. Import browser-safe coordinate helpers directly from `transforms.ts`; do not bundle the server barrel into the viewer. Canonical entities come from `src/domain`.

## Preparation and rendering

The runtime injects private byte reads/writes. Never expose storage references to the browser. Validate the original upload with `prepareDrawingPage` before analysis. Limits: 20 MiB original, 20 pages, 40 million decoded pixels, 2048-pixel maximum analysis edge. The source frame is the orientation-normalized image, or PDF crop rendered at 144 DPI with intrinsic rotation applied. PDF.js uses 72-point page units; the renderer uses scale 2. Images retain their oriented native dimensions. The transform maps source pixels to analysis raster pixels; its inverse maps model geometry back. UI zoom/pan is a separate transform.

`createBrowserPageRenderer` in `browser-renderer.ts` implements the constitution's browser rendering requirement using PDF.js and browser canvas. Team 1 must configure `GlobalWorkerOptions.workerSrc` to a bundled worker of the same installed PDF.js version. EXIF orientation is applied by `createImageBitmap`. Header-only inspection validates PNG/JPEG dimensions and EXIF orientation before decoding; all eight TIFF orientations use the oriented source frame. Image DPI is omitted because it is not physical scale evidence. PDF passwords/corruption are rejected with distinct sanitized errors; password rejection settles promptly, and loading tasks are destroyed on success and failure. The optional `loadPdf` seam supports parser testing without browser canvas.

**Integration gate:** persistent runtime preparation requires an injected `PageRenderer` running in an agreed rendering environment. There is no server renderer in this delivery. Do not silently move confidential uploads to browser-supplied geometry or trust a client-generated raster without server validation. Team 3 must agree the rendering architecture/governance change before enabling server PDF rasterization. A future Node renderer would require direct dependencies added by Team 3, not transitive imports.

## Vision and coordination

Create `createClaudeVisionRunner(serverOwnedClient, configuredModel)` in `src/vision/claude.ts`. Credentials stay inside the injected SDK client. The SDK is configured per request with automatic retries disabled and a 60-second timeout; the adapter permits one transient retry. Structured output uses the installed SDK's Zod output helper. No model is hardcoded. `reserveBudget` must atomically reserve enough for both possible calls; adapter usage reports provider tokens, while Team 3 calculates dollars from configured pricing.

Supply a cache scoped to private runtime storage. The cache key contains project/drawing/revision/floor identity, content hash, page, preprocessing/model/prompt versions and coordinate transform. Concurrent calls using the same cache instance share work. Failed results are not cached. The runtime must independently reject stale revisions before persisting results and emit real start/completion/failure events. This module does not publish events or persist entities.

AI dimensions are always unverified. Missing-input keys are element/metric within the supplied revision. Explicit labels retain raw text evidence and original units. Route lengths are withheld without a graph. When confirmed elements exist for a floor, those observations are authoritative and new suggestions are withheld rather than automatically duplicating or matching them. A future explicit merge UI can relax this policy.

`correctMeasurement` creates replacement measurement/evidence records; it does not commit revisions. Team 3 must validate the current base revision and transactionally persist revision, evidence and replacement. A hypothetical recheck bypasses these functions and Vision entirely.

## Synthetic demo

Call `loadConfirmedFixture(parsedJson, context)` explicitly with either `fixtures/plans/office-a.json` or `office-b.json`. These are authored synthetic observations, not real architect approvals or regulatory requirements. Display the returned disclosure warning. The JSON geometry refers to the corresponding 800×600 PNG/JPG, not to the PDF render. The two-page PDF is an independent normalization fixture; its source frame is 1600×1200. Fixtures contain no findings or rule thresholds. The engine computes all outcomes.

Optional asset regeneration uses `fixtures/plans/generate.mjs`. It requires a direct development dependency on `@napi-rs/canvas` (currently only transitively installed); request that dependency from Team 3 before relying on regeneration in CI. Committed raster/PDF assets need no generator at runtime.

## Verification limits

Unit tests use injected rendering and inference adapters. A real browser render/alignment rehearsal, live Claude smoke test with configured credentials/model/budget, and Team 3's stale-result/event/engine integration are required before demo acceptance. These checks cannot be claimed from mocked tests.


## Follow-up verification after integrating main

- Added header/renderer tests for actual PNG/JPG assets, all eight EXIF orientations, malformed frames/EXIF, pre-allocation limits, selected PDF page rotation/crop metadata, password failures, and cleanup.
- The actual two-page PDF is parsed using PDF.js's Node-compatible legacy build in tests. This verifies the committed PDF and page metadata, not visual rendering. The standard PDF.js build uses a newer typed-array API absent in the current Node 24 host; keep the browser build in browser code and the legacy build in Node-only parser tests.
- Browser alignment rehearsal could not run because no browser connection was available. Configured provider model discovery returned HTTP 404; no live inference or model availability has been confirmed. No confidential drawings were submitted.
