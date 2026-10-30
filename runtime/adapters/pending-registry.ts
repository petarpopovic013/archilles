import type { RegistryPort } from "../ports";

/**
 * Stand-in until `src/rules/registry` and `src/rules/applicability` are merged: no verified rules
 * exist, so nothing is selected or executed and coverage honestly reports zero active checks.
 */
export function createPendingRegistry(): RegistryPort {
  return {
    async getActiveRules() {
      return [];
    },
    async selectApplicableRules() {
      return { ruleIds: [], explanations: {}, missingContext: [] };
    },
    async snapshot() {
      return { sources: [], provisionCount: 0, rules: [] };
    },
  };
}
