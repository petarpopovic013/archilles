import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestions } from "../../runtime/participants/regulation";

test("one over-long question falls back to its template instead of failing every question", () => {
  const answer = JSON.stringify({ questions: [
    { field: "characteristic.isNewBuild", question: "Da li je objekat nov?" },
    { field: "element.subtype", question: "x".repeat(400) },
  ] });
  assert.deepEqual(parseQuestions(answer), { questions: [{ field: "characteristic.isNewBuild", question: "Da li je objekat nov?" }] });
});

test("an answer without the questions shape is still invalid output", () => {
  assert.equal(parseQuestions("not json"), undefined);
  assert.equal(parseQuestions(JSON.stringify({ ruleIds: ["a"] })), undefined);
});
