import {
  contractFixture,
  type ArchitecturalElement,
  type ComplianceRule,
  type ElementType,
  type Measurement,
  type Metric,
  type Project,
} from "../../src/domain";
import { unitForMetric } from "../../src/domain";
import type { EvaluationContext } from "../../src/rules/engine";

/**
 * TEST-ONLY synthetic data. Thresholds and conditions below are arbitrary engine inputs;
 * they assert no Serbian legal requirement and must never be copied into the rule registry.
 */
let counter = 0;
export const testId = () => `00000000-0000-4000-9000-${(++counter).toString(16).padStart(12, "0")}`;

export const NOW = "2026-10-30T12:00:00.000Z";

export function project(overrides: Partial<Project> = {}): Project {
  return { ...contractFixture.project, ...overrides };
}

export function element(type: ElementType, overrides: Partial<ArchitecturalElement> = {}): ArchitecturalElement {
  return {
    ...contractFixture.element,
    id: testId(),
    type,
    extraction: "USER_CONFIRMED",
    evidenceIds: [testId()],
    ...overrides,
  };
}

export function measurement(target: ArchitecturalElement, metric: Metric, value: number, overrides: Partial<Measurement> = {}): Measurement {
  return {
    ...contractFixture.measurement,
    id: testId(),
    elementId: target.id,
    metric,
    value,
    unit: unitForMetric(metric),
    evidenceIds: [testId()],
    ...overrides,
  };
}

export function rule(overrides: Partial<ComplianceRule> = {}): ComplianceRule {
  return {
    id: testId(),
    version: 1,
    sourceId: testId(),
    sourceVersion: "test-only",
    provisionIds: [testId()],
    title: "TEST-ONLY synthetic corridor width check",
    lifecycle: "ACTIVE",
    elementType: "CORRIDOR",
    applicability: { op: "EQ", field: "purpose", value: "OFFICE" },
    exceptionConditions: [],
    requiredInputs: ["CLEAR_WIDTH_M"],
    evaluation: { kind: "MIN", metric: "CLEAR_WIDTH_M", threshold: 1.2, unit: "m" },
    approvedBy: "test-fixture",
    approvedAt: NOW,
    testFixtureIds: [testId()],
    interpretationNotes: ["Synthetic engine test rule; not a legal requirement."],
    ...overrides,
  };
}

export function context(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    project: project(),
    elements: [],
    measurements: [],
    asOf: "2026-10-30",
    now: NOW,
    newId: testId,
    ...overrides,
  };
}
