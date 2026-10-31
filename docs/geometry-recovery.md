# Geometry workflow recovery — 31 October 2026

Reference: `28d32b5` (Merge geometry reading workflow and DJOLEPROMPT into main).
Compared with: `0377fc6`.

## Findings and changes

- Later code removed the overview confirmation checkpoint and legend/review panel,
  added subtype/classification reasoning to detail prompts and provider output keys,
  and reused stored partial results. The system prompt, source framing and wall/room
  reconstruction algorithms themselves were unchanged between these commits.
- Restored the reference extraction prompts, compact provider keys, confirmation
  checkpoint and geometry panel. New reads use `geometry-reading-v7`; existing
  completed projects require explicit rereading. Assisted findings remain available
  after detailed geometry. Confirmation alone never approves a physical dimension.
- Replayed two private saved plans without provider calls. One reproduced
  `RangeError: Invalid array length` at `wallMask`'s hatch additions. Overlapping
  hypotheses repeatedly appended the same pixel indices, exhausting the array.
  A raster-sized bitset and interval endpoints compute the same union with bounded
  storage. This defect also existed in the reference code; restoring that code
  alone would not fix this input.
- A bounded live check read all four regions and a focused follow-up, then failed
  on the Geometry controller's final acknowledgement with `PROVIDER_DNS_FAILED`.
  The runtime previously discarded the validated extraction in this case. It now
  retains the extraction, warning, cost and provider diagnostic, with a PARTIAL
  session. Tool scope/limit and stale-revision failures still reject results.
- Continuing a checkpoint persists fresh suggestions even when human geometry
  already exists. Overview cache and cumulative page budgets survive confirmation.
  Unit-only changes still reuse geometry without another Vision call.

## Verification

- `node --import tsx --test --test-reporter=dot`: passed, 517 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.
- Two-layout HTTP integration: upload, overview pause, cached continuation, four
  regions, preservation of human geometry/history, and unit-only reuse.
- Regression tests cover dense horizontal/vertical bands and a provider failure
  after successful tool execution, alongside the existing scope/limit guards.
- Private saved-response replay: both distinct uploaded plans process all four
  regions without `GEOMETRY_PIPELINE_FAILED`. Remaining boundary/opening issues
  remain PARTIAL; no claim of perfect geometry is made.
- Browser checks used mocked API responses in an isolated context. The restored
  panel renders in the existing Turbopack dev server at 1440px and 390px; mobile
  opens the checkpoint panel without horizontal overflow. No browser errors.
- `npm run build`: blocked by the environment's Turbopack subprocess port binding
  (`Operation not permitted`), including an escalated attempt. Webpack compilation
  succeeds, but the repository config applies its Tailwind loader only through
  Turbopack, so this fallback is not production visual acceptance. No build config
  was changed for this geometry task.

## Live check limits

The isolated live benchmark used the restored pipeline on
`residential-dimensioned.png`; estimated recorded cost was USD 0.250044. Its
extraction was lost by the acknowledgement error described above. All four detail
regions and the focused response were cached, allowing offline recovery after the
fix without buying another extraction.

Recovered room IoU against the existing **development-agent DRAFT references**:

| Reference room | Best IoU |
| --- | ---: |
| Bedroom 3 | 0.9296 |
| Bedroom 4 | 0.9667 |
| Bathroom | 0.9836 |

These are best spatial matches for three rooms, not human-reviewed ground truth,
full-plan recall or opening accuracy. Other geometry issues remain. Private replay
artifacts are under `/tmp/archilles-geometry-rollback-check`; live responses and
recovered overlay are under `/tmp/archilles-geometry-v7-live`. They are not committed.
