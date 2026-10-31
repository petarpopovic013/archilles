import assert from "node:assert/strict";
import type { ComplianceRule, RegulationProvision, RuleLifecycle } from "../../src/domain";
import review from "../../fixtures/regulations/004-human-review.json";
import activation from "../../fixtures/regulations/005-activation.json";

export function assertActiveRegistry(rules: ComplianceRule[]) {
  assert.deepEqual(
    rules.map((rule) => [rule.id, rule.version]).sort(),
    activation.activatedRules.map((entry) => [entry.ruleId, entry.ruleVersion]).sort(),
  );
  assert.ok(rules.every((rule) => rule.lifecycle === "ACTIVE"));
}

/** Tests bind current approval to its explicit scope instead of extending it to other rules. */
export function assertRuleApproval(rule: ComplianceRule, unreviewedLifecycle: RuleLifecycle) {
  const record = review.ruleApprovals.find((entry) => entry.ruleId === rule.id);
  const activated = activation.activatedRules.some((entry) => entry.ruleId === rule.id && entry.ruleVersion === rule.version);
  assert.equal(rule.lifecycle, record ? activated ? "ACTIVE" : "HUMAN_VERIFIED" : unreviewedLifecycle);
  assert.equal(rule.approvedBy, record?.approvedBy);
  assert.equal(rule.approvedAt, record?.approvedAt);
  if (record) {
    assert.equal(record.ruleVersion, rule.version);
    assert.deepEqual(record.testFixtureIds, rule.testFixtureIds);
    assert.equal(record.approvedBy, "Petar Popovic");
  }
}

export function assertProvisionApproval(provision: RegulationProvision) {
  assert.equal(provision.verification, review.provisionIds.includes(provision.id) ? "SOURCE_VERIFIED" : "UNVERIFIED");
}
