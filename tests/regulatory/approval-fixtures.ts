import assert from "node:assert/strict";
import type { ComplianceRule, RegulationProvision, RuleLifecycle } from "../../src/domain";
import review from "../../fixtures/regulations/004-human-review.json";

/** Tests bind current approval to its explicit scope instead of extending it to other rules. */
export function assertRuleApproval(rule: ComplianceRule, unreviewedLifecycle: RuleLifecycle) {
  const record = review.ruleApprovals.find((entry) => entry.ruleId === rule.id);
  assert.equal(rule.lifecycle, record ? "HUMAN_VERIFIED" : unreviewedLifecycle);
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
