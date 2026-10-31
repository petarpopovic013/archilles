# Rule activation, 31 October 2026

The user explicitly requested: “copy all human rules to active”. This authorization is recorded separately in [005-activation.json](../../fixtures/regulations/005-activation.json). The earlier human review and its original reviewer/timestamps remain in [004-human-review.json](../../fixtures/regulations/004-human-review.json); that historical record did not authorize activation.

Twenty previously HUMAN_VERIFIED rules now have lifecycle ACTIVE in the existing registry seed files. Their rule IDs, versions, legal definitions, source/provision references, effective dates, fixture IDs and approval metadata are unchanged. Only lifecycle and the activation annotation changed. No duplicate registry was created.

The active set comprises rule 001/10, rules 002/11–13, rules 003/30–41 and rules 004/60–63. All twenty have an implemented MIN evaluator, current confirmed source provenance, verified provisions, human review metadata and executable numerical/applicability fixture coverage. `getActiveRules(asOf)` and `getActiveFloorPlanRules(asOf)` return this set when the existing source/effective-date gates admit it. The date parameter remains the legal/source applicability date; activation authorization time is recorded in the separate audit.

Six rules remain HUMAN_VERIFIED with `EVALUATOR_UNAVAILABLE`: 004/64 (ramp landing rectangle), 004/65 (lift cabin rectangle), 004/66 (lift approach rectangle), 004/67 (WC turning circle), 004/68 (workspace turning circle), and 004/69 (manual door side clearance). Their reviewed evaluators are not implemented. The four AI_REVIEWED and five CANDIDATE rules outside the approved scope remain unchanged.

The production runtime already reads this registry through `runtime/adapters/registry.ts`; no API, schema, dependency or persistence changes were needed. Restart an already running runtime to load the updated registry, then start a new analysis. Existing findings remain historical records. Applicability still requires project context and confirmed element subtypes. Missing or unverified dimensions produce UNKNOWN rather than numerical PASS/FAIL. The default geometry smoke command deliberately uses an empty registry and does not exercise production rule coverage.

Verification completed on this change:

- `npm test`: 431 passed, zero failures or skips.
- `npm run typecheck`: passed (`next typegen` and `tsc --noEmit`).
- `npm run lint`: passed.
- `npm run build`: passed.

Tests execute the actual activated registry entries against pass/fail/boundary/missing/unverified/applicability scenarios, in addition to existing isolated evaluator probes. The two disclosed synthetic office plans produce FAIL and PASS for the actual active corridor minimum rule using explicit synthetic project/subtype context and their distinct confirmed reference widths (1.05 m and 1.55 m). No model calls or new source interpretations were used for this activation.
