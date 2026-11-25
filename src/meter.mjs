// Spend meter. Costs come from the provider's own usage counts times the price table.
// Before each call the worst case (estimated input plus the full output cap) must fit in the
// remaining budget, so the budget is never passed, only approached.

export class BudgetExceeded extends Error {
  constructor(spent, worstCase, budget) {
    super(`budget would be exceeded: spent $${spent.toFixed(4)} plus a worst case of $${worstCase.toFixed(4)} for the next call is over the $${budget} cap`);
    this.name = 'BudgetExceeded';
  }
}

/** usage: { input, cacheRead, cacheWrite, output } in tokens, input excluding cached tokens. */
export function costOf(usage, price) {
  if (usage.cacheWrite > 0 && price.cache_write_per_mtok === null) throw new Error('usage reports cache writes but the price table has no cache write price');
  return (
    usage.input * price.input_per_mtok +
    usage.cacheRead * price.cache_read_per_mtok +
    usage.cacheWrite * (price.cache_write_per_mtok ?? 0) +
    usage.output * price.output_per_mtok
  ) / 1e6;
}

export function worstCaseCost(estInputTokens, maxOutputTokens, price) {
  return (estInputTokens * price.input_per_mtok + maxOutputTokens * price.output_per_mtok) / 1e6;
}

export class Meter {
  constructor(budgetUsd) {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('budget must be a positive number of USD');
    this.budget = budgetUsd;
    this.spent = 0;
    this.calls = 0;
  }
  /** Throws BudgetExceeded if a call with this worst case could pass the cap. */
  assertRoom(worstCase) {
    if (this.spent + worstCase > this.budget) throw new BudgetExceeded(this.spent, worstCase, this.budget);
  }
  record(cost) {
    this.spent += cost;
    this.calls += 1;
  }
}
