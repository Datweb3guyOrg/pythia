import type { Estimate, MarketContext } from "./estimators/types.js";

export interface SizingConfig {
  /** fraction of full Kelly to actually bet, e.g. 0.35 */
  kellyFraction: number;
  /** minimum |estimate - price| required to trade at all */
  edgeThreshold: number;
  /** minimum estimator confidence required to trade at all */
  confidenceThreshold: number;
  /** hard cap on stake per single market, in competition tokens */
  maxStakePerMarket: bigint;
  /** hard cap on stake per category, in competition tokens */
  maxStakePerCategory: bigint;
}

export const DEFAULT_SIZING: SizingConfig = {
  kellyFraction: 0.35,
  edgeThreshold: 0.06,
  confidenceThreshold: 0.4,
  // raised deliberately (was 10%/30%) to let high-confidence calls size up
  // closer to how the current leaderboard leader concentrates bets — real
  // tradeoff accepted: a wrong proxy-based estimate (see estimator risk
  // notes) now costs more. kellyFraction unchanged, so low-confidence
  // trades still don't use this extra room on their own.
  maxStakePerMarket: 350_000_000n, // 350 tokens, 6 decimals (35% of 1,000 TST bankroll)
  maxStakePerCategory: 700_000_000n, // 700 tokens, 6 decimals (70% of bankroll)
};

export interface SizingDecision {
  shouldTrade: boolean;
  side: "buy" | "sell" | null;
  stake: bigint; // 0 if shouldTrade is false
  edge: number;
  reason: string;
}

/**
 * Fractional-Kelly sizing against an LMSR implied price.
 * f* = edge / odds, where odds = price / (1 - price) for a binary-style outcome.
 * bankroll and category exposure already spent are supplied by the caller
 * so this stays a pure function — no hidden state.
 */
export function sizePosition(
  ctx: MarketContext,
  est: Estimate,
  bankroll: bigint,
  categorySpent: bigint,
  cfg: SizingConfig = DEFAULT_SIZING
): SizingDecision {
  const edge = est.probability - ctx.impliedPrice;
  const absEdge = Math.abs(edge);

  if (absEdge < cfg.edgeThreshold || est.confidence < cfg.confidenceThreshold) {
    return {
      shouldTrade: false,
      side: null,
      stake: 0n,
      edge,
      reason: `below threshold (edge=${edge.toFixed(3)}, confidence=${est.confidence.toFixed(2)})`,
    };
  }

  const side: "buy" | "sell" = edge > 0 ? "buy" : "sell";
  const price = side === "buy" ? ctx.impliedPrice : 1 - ctx.impliedPrice;
  const odds = price / (1 - price);
  const fullKelly = absEdge / odds;
  const scaledKelly = Math.max(0, Math.min(1, fullKelly * cfg.kellyFraction * est.confidence));

  let stake = BigInt(Math.floor(Number(bankroll) * scaledKelly));
  stake = stake < cfg.maxStakePerMarket ? stake : cfg.maxStakePerMarket;

  const categoryRoom = cfg.maxStakePerCategory - categorySpent;
  if (categoryRoom <= 0n) {
    return { shouldTrade: false, side: null, stake: 0n, edge, reason: "category exposure cap reached" };
  }
  stake = stake < categoryRoom ? stake : categoryRoom;

  if (stake <= 0n) {
    return { shouldTrade: false, side: null, stake: 0n, edge, reason: "sized to zero" };
  }

  return {
    shouldTrade: true,
    side,
    stake,
    edge,
    reason: `${side} — edge=${edge.toFixed(3)}, kelly*=${scaledKelly.toFixed(4)}, stake=${stake}`,
  };
}
