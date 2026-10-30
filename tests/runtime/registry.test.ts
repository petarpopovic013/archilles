import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegulatoryRegistry } from '../../runtime/adapters/registry';
import { contractFixture } from '../../src/domain';

test('registry bridge exposes source coverage without promoting reviewed rules to ACTIVE', async () => {
  const registry = createRegulatoryRegistry(), snapshot = await registry.snapshot();
  assert.ok(snapshot.sources.length >= 2); assert.ok(snapshot.provisionCount > 0);
  assert.ok(snapshot.rules.some(rule => rule.lifecycle === 'HUMAN_VERIFIED'));
  assert.deepEqual(await registry.getActiveRules('2026-10-30'), []);
  snapshot.rules.splice(0); assert.ok((await registry.snapshot()).rules.length > 0);
});

test('applicability bridge projects historical observations without changing their records', async () => {
  const registry = createRegulatoryRegistry();
  const element = structuredClone(contractFixture.element), original = structuredClone(element);
  const project = { ...contractFixture.project, revision: element.revision + 1 };
  assert.deepEqual(await registry.selectApplicableRules(project, [element], []), { ruleIds: [], explanations: {}, missingContext: [] });
  assert.deepEqual(element, original);
  await assert.rejects(registry.selectApplicableRules({ ...project, revision: element.revision }, [{ ...element, revision: element.revision + 1 }], []));
});
