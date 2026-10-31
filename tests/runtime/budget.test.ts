import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Budget, BudgetExceededError } from "../../runtime/ai/budget";
import { openDatabase } from "../../runtime/db/connection";

function setup(hourlyUsd: number, totalUsd = 20) {
  const db = openDatabase(":memory:");
  db.pragma("foreign_keys = OFF");
  let clock = "2026-10-31T12:00:00.000Z";
  const budget = new Budget(db, { totalUsd, hourlyUsd }, () => clock);
  const spend = (costUsd: number, finishedAt: string) =>
    db.prepare("INSERT INTO agent_runs (id, session_id, role, status, estimated_cost_usd, data) VALUES (?, 's', 'REVIEW', 'COMPLETED', ?, ?)")
      .run(randomUUID(), costUsd, JSON.stringify({ startedAt: finishedAt, finishedAt }));
  return { budget, spend, setClock: (value: string) => { clock = value; } };
}

const code = (fn: () => unknown) => {
  try { fn(); } catch (error) { return error instanceof BudgetExceededError ? error.code : "OTHER"; }
  return "ALLOWED";
};

test("the hourly cap blocks a burst well before the total budget", () => {
  const { budget, spend } = setup(3);
  spend(2.5, "2026-10-31T11:30:00.000Z");
  assert.equal(code(() => budget.reserve(0.4)), "ALLOWED");
  assert.equal(code(() => budget.reserve(0.2)), "BUDGET_RATE_LIMITED", "in-flight reservations count toward the hour");
});

test("spend older than an hour no longer counts toward the hourly cap", () => {
  const { budget, spend, setClock } = setup(3);
  spend(2.9, "2026-10-31T11:30:00.000Z");
  assert.equal(code(() => budget.reserve(0.5)), "BUDGET_RATE_LIMITED");
  setClock("2026-10-31T12:31:00.000Z");
  assert.equal(code(() => budget.reserve(0.5)), "ALLOWED");
});

test("the total cap still wins over the hourly window", () => {
  const { budget, spend } = setup(3, 5);
  spend(4.9, "2026-10-31T08:00:00.000Z");
  assert.equal(code(() => budget.reserve(0.5)), "BUDGET_EXCEEDED");
});

test("settled reservations free hourly headroom", () => {
  const { budget } = setup(1);
  const first = budget.reserve(0.8);
  assert.equal(code(() => budget.reserve(0.5)), "BUDGET_RATE_LIMITED");
  first.settle();
  assert.equal(code(() => budget.reserve(0.5)), "ALLOWED");
});
