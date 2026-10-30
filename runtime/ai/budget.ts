import type { Db } from "../db/connection";

export class BudgetExceededError extends Error {
  readonly code = "BUDGET_EXCEEDED";
  constructor() {
    super("BUDGET_EXCEEDED");
    this.name = "BudgetExceededError";
  }
}

export interface Reservation {
  /** Replaces the reservation with the actual cost, which the caller records on its AgentRun. */
  settle(): void;
}

/**
 * Process-wide AI spend cap. Spent = recorded AgentRun costs; reservations hold the worst case of
 * in-flight calls so concurrent agents cannot jointly overshoot the configured limit.
 */
export class Budget {
  private reserved = 0;

  constructor(private readonly db: Db, readonly limitUsd: number) {}

  spentUsd(): number {
    return this.db.prepare("SELECT COALESCE(SUM(estimated_cost_usd), 0) FROM agent_runs").pluck().get() as number;
  }

  reserve(maxCostUsd: number): Reservation {
    if (this.spentUsd() + this.reserved + maxCostUsd > this.limitUsd) throw new BudgetExceededError();
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
