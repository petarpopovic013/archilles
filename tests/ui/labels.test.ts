import assert from "node:assert/strict";
import test from "node:test";
import { layoutPlanLabels, type PlanLabelInput } from "../../src/ui/viewer/labels";

const inputs = (count: number): PlanLabelInput[] => Array.from({ length: count }, (_, i) => ({
  id: String(i), text: `${i + 1}. Door · Unknown`, priority: 2, selected: false,
  bounds: { x: 100, y: 100, width: 20, height: 20 },
}));

test("dense labels never overlap or leave a narrow viewport; omitted labels are counted", () => {
  const source = inputs(150);
  const original = structuredClone(source);
  const { labels, hiddenCount } = layoutPlanLabels(source, { scale: 1, x: 0, y: 0 }, { width: 320, height: 480 });
  assert.ok(labels.length > 0 && hiddenCount > 0);
  assert.equal(labels.length + hiddenCount, source.length);
  for (const [index, label] of labels.entries()) {
    assert.ok(label.x >= 8 && label.y >= 8);
    assert.ok(label.x + label.width <= 312 && label.y + label.height <= 440);
    for (const other of labels.slice(index + 1)) {
      assert.ok(label.x + label.width <= other.x || other.x + other.width <= label.x ||
        label.y + label.height <= other.y || other.y + other.height <= label.y);
    }
  }
  assert.deepEqual(source, original, "label placement must never alter source geometry");
});

test("selected elements retain a label even when lower-priority labels fill the viewport", () => {
  const source = inputs(100);
  source[99].selected = true;
  const { labels } = layoutPlanLabels(source, { scale: 1, x: 0, y: 0 }, { width: 320, height: 180 });
  assert.equal(labels[0].id, "99");
});

test("leaders follow pan and zoom while label text stays at a readable screen size", () => {
  const source = inputs(1);
  const before = layoutPlanLabels(source, { scale: 1, x: 0, y: 0 }, { width: 1000, height: 800 }).labels[0];
  const after = layoutPlanLabels(source, { scale: 2, x: 30, y: 40 }, { width: 1000, height: 800 }).labels[0];
  assert.deepEqual(before.anchor, { x: 110, y: 100 });
  assert.deepEqual(after.anchor, { x: 250, y: 240 });
  assert.equal(before.width, after.width);
  assert.equal(before.height, after.height);
});

test("offscreen elements produce no floating labels and edge elements stay readable", () => {
  const source = inputs(2);
  source[0].bounds = { x: -1000, y: 0, width: 10, height: 10 };
  source[1].bounds = { x: 310, y: 0, width: 10, height: 20 };
  const { labels, hiddenCount } = layoutPlanLabels(source, { scale: 1, x: 0, y: 0 }, { width: 320, height: 480 });
  assert.equal(labels.length, 1);
  assert.equal(labels[0].id, "1");
  assert.equal(hiddenCount, 0);
  assert.ok(labels[0].x + labels[0].width <= 312);
  assert.ok(labels[0].y >= 8);
});
