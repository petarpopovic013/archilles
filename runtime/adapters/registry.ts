import { selectApplicableRules } from '../../src/rules/applicability';
import { complianceRules, getActiveRules, regulationProvisions, regulationSources } from '../../src/rules/registry';
import type { RegistryPort } from '../ports';

/** Read-only bridge to Team 4's registry. Lifecycle and source gates stay with the registry. */
export function createRegulatoryRegistry(): RegistryPort {
  return {
    async getActiveRules(asOf) { return getActiveRules(asOf); },
    async selectApplicableRules(project, elements, rules) {
      if (elements.some(element => element.projectId !== project.id || element.revision > project.revision)) {
        throw new Error('REGULATORY_ELEMENT_REVISION_MISMATCH');
      }
      // Persisted observations retain their historical creation revision. Applicability consumes
      // the current immutable project snapshot; project these records without rewriting history.
      return selectApplicableRules(project, elements.map(element => ({ ...element, revision: project.revision })), rules);
    },
    async snapshot() {
      return structuredClone({ sources: regulationSources, provisionCount: regulationProvisions.length, rules: complianceRules });
    },
  };
}
