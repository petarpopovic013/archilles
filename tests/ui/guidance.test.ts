import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisSnapshot, ArchitecturalElement, RuleEvaluation } from "../../src/domain";
import { activeCategories, buildingClassLabel, categoryLabel, checklistFor, stepsFor, widthFromMark } from "../../src/ui/guidance";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const door = (n: number, extra: Partial<ArchitecturalElement> = {}): ArchitecturalElement => ({
  id: id(n), projectId: id(900), floorId: id(901), revision: 2, type: "DOOR", label: `Door ${n}`,
  geometry: { kind: "BBOX", x: 1, y: 1, width: 5, height: 5 }, relationIds: [], extraction: "AI_SUGGESTED", evidenceIds: [], ...extra,
});
const unknown = (n: number, elementId: string, extra: Partial<RuleEvaluation> = {}): RuleEvaluation => ({
  id: id(100 + n), projectId: id(900), projectRevision: 2, ruleId: id(200), ruleVersion: 1, elementId, status: "UNKNOWN",
  evidenceIds: [], missingInputs: [], reasonCode: "APPLICABILITY_UNKNOWN", evaluatedAt: "2026-10-31T10:00:00Z", ...extra,
});

test("an unknown check says in plain words what to do and where", () => {
  const steps = stepsFor(unknown(1, id(1), { unknownFacts: ["characteristic.isNewBuild", "element.subtype"] }), door(1));
  assert.deepEqual(steps, [
    { text: "Answer in project details: Is this a new building?", fix: { kind: "project" } },
    { text: "Choose what kind of door this is", fix: { kind: "element", elementId: id(1) } },
  ]);
  assert.equal(stepsFor(unknown(2, id(1), { reasonCode: "SUBTYPE_UNCONFIRMED", unknownFacts: ["element.subtype"] }), door(1))[0].text,
    "Confirm the suggested door category");
  assert.equal(stepsFor(unknown(3, id(1), { reasonCode: "INPUT_UNVERIFIED", missingInputs: ["CLEAR_WIDTH_M"] }), door(1))[0].text,
    "Confirm the clear width");
  assert.deepEqual(stepsFor({ ...unknown(4, id(1)), status: "PASS", observed: 1, required: 0.9 }, door(1)), []);
});

test("the checklist groups every blocker into the actions that unblock it", () => {
  const snapshot = {
    elements: [door(1), door(2), door(3, { extraction: "USER_CONFIRMED", subtype: "ACCESSIBLE_INTERNAL_DOOR_ART22" })],
    evaluations: [
      unknown(1, id(1), { unknownFacts: ["characteristic.isNewBuild", "element.subtype"] }),
      unknown(2, id(2), { unknownFacts: ["characteristic.isNewBuild", "element.subtype"] }),
      unknown(3, id(3), { reasonCode: "INPUT_UNVERIFIED", missingInputs: ["CLEAR_WIDTH_M"] }),
    ],
  } as unknown as AnalysisSnapshot;
  const list = checklistFor(snapshot);
  assert.deepEqual(list.questions, ["Is this a new building?"]);
  assert.deepEqual(list.classify, [{ type: "DOOR", count: 2, firstId: id(1) }]);
  assert.deepEqual(list.measure, { count: 1, firstId: id(3) });
  assert.equal(list.done, false);
  assert.equal(checklistFor({ elements: [], evaluations: [] } as unknown as AnalysisSnapshot).done, true);
});

test("door marks suggest the smaller number as a width in centimetres", () => {
  assert.deepEqual(widthFromMark(["V2", "80/200"]), { centimetres: 80, mark: "80/200" });
  assert.deepEqual(widthFromMark(["200\n80"]), { centimetres: 80, mark: "200/80" });
  assert.deepEqual(widthFromMark(["91/220"]), { centimetres: 91, mark: "91/220" });
  assert.equal(widthFromMark(["366.5", "V1"]), undefined, "a single room dimension is not a door mark");
});

test("categories and building classes read as plain language", () => {
  assert.equal(categoryLabel("ACCESSIBLE_INTERNAL_DOOR_ART22"), "Internal door on an accessible route");
  assert.equal(categoryLabel("OTHER", "DOOR"), "Not one of these — don't check this door");
  assert.equal(categoryLabel("SOMETHING_NEW"), "Something new");
  assert.equal(buildingClassLabel("ИП1"), "Detached office building, up to 10 m");
  const requirements = { classifications: [], subtypes: [
    { elementType: "DOOR", subtype: "A", rules: [{ ruleId: id(1), ruleVersion: 1, title: "t", lifecycle: "ACTIVE", metrics: [] }] },
    { elementType: "DOOR", subtype: "B", rules: [{ ruleId: id(2), ruleVersion: 1, title: "t", lifecycle: "CANDIDATE", metrics: [] }] },
  ] } as const;
  assert.deepEqual(activeCategories(requirements as never, "DOOR"), ["A"], "only categories that unlock an active check are offered");
});

test("checks for things the drawing doesn't show need no action and raise no project questions", () => {
  const absent = unknown(9, id(0), { elementId: undefined, unknownFacts: ["element.type", "element.subtype", "characteristic.hasPublicAccess"] });
  assert.deepEqual(stepsFor(absent, undefined, "STAIR"), [{ text: "No stair was found on this drawing, so this check cannot run here." }]);
  const list = checklistFor({ elements: [], evaluations: [absent] } as unknown as AnalysisSnapshot);
  assert.deepEqual([list.questions, list.notOnDrawing, list.done], [[], 1, true]);
});
