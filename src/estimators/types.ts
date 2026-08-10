export type Category = "crypto" | "economics" | "politics" | "sports" | "culture" | "miscellaneous" | "tech";

export interface Estimate {
  /** probability the estimator assigns to this outcome, 0-1 */
  probability: number;
  /** 0-1, how much weight the sizing module should give this estimate */
  confidence: number;
  /** short human-readable reason, logged alongside every trade */
  rationale: string;
}

export interface MarketContext {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  outcomeCount: number;
  question: string;
  category: Category;
  /** current on-chain implied probability for this outcome, 0-1 */
  impliedPrice: number;
}

export interface Estimator {
  category: Category;
  estimate(ctx: MarketContext): Promise<Estimate | null>;
}
