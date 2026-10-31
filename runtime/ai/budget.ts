import type { Db } from "../db/connection";

const WINDOW_MS = 60 * 60 * 1000;

export type BudgetErrorCode = "BUDGET_EXCEEDED" | "BUDGET_RATE_LIMITED";

export class BudgetExceededError extends Error {
  constructor(readonly code: BudgetErrorCode = "BUDGET_EXCEEDED") {
    super(code);
    this.name = "BudgetExceededError";
  }
}

export interface Reservation {
  /** Replaces the reservation with the actual cost, which the caller records on its AgentRun. */
  settle(): void;
}

export interface BudgetLimits {
  totalUsd: number;
  /** Rolling one-hour cap so a burst of runs cannot drain the total budget at once. */
  hourlyUsd: number;
}

/**
 * Process-wide AI spend cap. Spent = recorded AgentRun costs; reservations hold the worst case of
 * in-flight calls so concurrent agents cannot jointly overshoot either the total or hourly limit.
 */
export class Budget {
  private reserved = 0;

  constructor(private readonly db: Db, readonly limits: BudgetLimits, private readonly now: () => string = () => new Date().toISOString()) {}

  spentUsd(): number {
    return this.db.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM agent_runs").pluck().get() as number;
  }

  /** Cost of runs that finished (or, lacking that, started) within the last hour. */
  spentLastHourUsd(): number {
    const since = new Date(Date.parse(this.now()) - WINDOW_MS).toISOString();
    return this.db.prepare(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM agent_runs
      WHERE julianday(COALESCE(json_extract(data, '$.finishedAt'), json_extract(data, '$.startedAt'))) >= julianday(?)
    `).pluck().get(since) as number;
  }

  reserve(maxCostUsd: number): Reservation {
    if (this.spentUsd() + this.reserved + maxCostUsd > this.limits.totalUsd) throw new BudgetExceededError();
    if (this.spentLastHourUsd() + this.reserved + maxCostUsd > this.limits.hourlyUsd) throw new BudgetExceededError("BUDGET_RATE_LIMITED");
    this.reserved += maxCostUsd;
    let open = true;
    return {
      settle: () => {
        if (!open) return;
        open = false;
        this.reserved -= maxCostUsd;
      },
    };
  }
}
