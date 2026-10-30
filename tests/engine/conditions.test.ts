import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCondition } from "../../src/rules/engine";
import { element, project } from "./fixtures";

test("missing facts are UNKNOWN, never false", () => {
  const facts = { project: project() };
  assert.deepEqual(evaluateCondition({ op: "GTE", field: "occupantCount", value: 50 }, facts),
    { truth: "UNKNOWN", unknownFacts: ["occupantCount"] });
  assert.deepEqual(evaluateCondition({ op: "EQ", field: "characteristic", key: "hasRamp", value: true }, facts),
    { truth: "UNKNOWN", unknownFacts: ["characteristic.hasRamp"] });
  assert.equal(evaluateCondition({ op: "EQ", field: "classification", value: "A" }, facts).truth, "UNKNOWN");
  assert.equal(evaluateCondition({ op: "EQ", field: "element.type", value: "DOOR" }, facts).truth, "UNKNOWN");
});

test("known facts compare exactly, including numeric boundaries and IN", () => {
  const facts = { project: project({ occupantCount: 50, characteristics: { hasRamp: false } }), element: element("DOOR") };
  assert.equal(evaluateCondition({ op: "GTE", field: "occupantCount", value: 50 }, facts).truth, "TRUE");
  assert.equal(evaluateCondition({ op: "LTE", field: "occupantCount", value: 49 }, facts).truth, "FALSE");
  assert.equal(evaluateCondition({ op: "EQ", field: "characteristic", key: "hasRamp", value: true }, facts).truth, "FALSE");
  assert.equal(evaluateCondition({ op: "IN", field: "element.type", value: ["DOOR", "EXIT"] }, facts).truth, "TRUE");
  assert.equal(evaluateCondition({ op: "IN", field: "phase", value: ["DESIGN"] }, facts).truth, "FALSE");
});

test("ALL and ANY follow Kleene logic and report unknown facts only when undecided", () => {
  const facts = { project: project() };
  const unknown = { op: "GTE" as const, field: "floorCount" as const, value: 2 };
  const yes = { op: "EQ" as const, field: "purpose" as const, value: "OFFICE" };
  const no = { op: "EQ" as const, field: "purpose" as const, value: "OTHER" };

  assert.equal(evaluateCondition({ op: "ALL", children: [unknown, no] }, facts).truth, "FALSE");
  assert.deepEqual(evaluateCondition({ op: "ALL", children: [unknown, yes] }, facts),
    { truth: "UNKNOWN", unknownFacts: ["floorCount"] });
  assert.equal(evaluateCondition({ op: "ANY", children: [unknown, yes] }, facts).truth, "TRUE");
  assert.equal(evaluateCondition({ op: "ANY", children: [unknown, no] }, facts).truth, "UNKNOWN");
  assert.equal(evaluateCondition({ op: "ANY", children: [no, no] }, facts).truth, "FALSE");
});
