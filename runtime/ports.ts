import type {
  ArchitecturalElement,
  ComplianceRule,
  Project,
  RegulationSource,
} from "../src/domain";
import type { PageRenderer } from "../src/geometry";
import type { VisionRunner } from "../src/vision/schema";

/** Rule selection proposes rule IDs and context needs; it never decides PASS/FAIL. */
export interface RuleSelection {
  ruleIds: string[];
  explanations: Record<string, string>;
  missingContext: string[];
}

export interface RegistrySnapshot {
  sources: RegulationSource[];
  provisionCount: number;
  /** Every rule version in the registry, any lifecycle; coverage counts them separately. */
  rules: ComplianceRule[];
}

/** Seam to Person 4's `src/rules/registry` and `src/rules/applicability`. */
export interface RegistryPort {
  getActiveRules(asOf: string): Promise<ComplianceRule[]>;
  selectApplicableRules(project: Project, elements: ArchitecturalElement[], rules: ComplianceRule[]): Promise<RuleSelection>;
  snapshot(): Promise<RegistrySnapshot>;
}

/** Seam to Person 2's `src/geometry` page preparation and `src/vision` adapter. */
export interface GeometryPort {
  renderer: PageRenderer;
  /** Absent when no provider is configured; extraction then fails visibly and evaluation shows UNKNOWN. */
  vision?: VisionRunner;
}
