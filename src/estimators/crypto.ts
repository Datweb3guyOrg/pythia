import type { Estimator, Estimate, MarketContext } from "./types.js";
import { CRYPTO_MARKETS, type CryptoMarketConfig } from "../config/markets.js";

async function fetchSpotPrice(coingeckoId: string): Promise<number> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`
  );
  if (!res.ok) throw new Error(`CoinGecko request failed: ${res.status}`);
  const json = await res.json();
  const price = json?.[coingeckoId]?.usd;
  if (typeof price !== "number") throw new Error(`No price for ${coingeckoId}`);
  return price;
}

/** logistic squash: how far price sits past a boundary, scaled by volatility */
function distanceToProbability(distanceFraction: number, volatilityScale: number): number {
  const z = distanceFraction / volatilityScale;
  return 1 / (1 + Math.exp(-z));
}

function estimateSingleSided(price: number, cfg: CryptoMarketConfig): { probability: number; confidence: number } {
  const distanceFraction = (price - cfg.threshold!) / cfg.threshold!;
  const probability =
    cfg.comparator === ">" || cfg.comparator === ">="
      ? distanceToProbability(distanceFraction, cfg.volatilityScale)
      : 1 - distanceToProbability(distanceFraction, cfg.volatilityScale);
  const confidence = Math.min(1, Math.abs(distanceFraction) / cfg.volatilityScale);
  return { probability, confidence };
}

function estimateBetween(price: number, cfg: CryptoMarketConfig): { probability: number; confidence: number } {
  const { thresholdLow, thresholdHigh } = cfg;
  if (thresholdLow === undefined || thresholdHigh === undefined) {
    throw new Error(`"between" comparator requires thresholdLow and thresholdHigh`);
  }
  // P(inside range) modeled as satisfying both boundaries independently —
  // an approximation, not a proper joint distribution, but reasonable for a
  // range that's narrow relative to typical daily volatility
  const distAboveLow = (price - thresholdLow) / thresholdLow;
  const distBelowHigh = (thresholdHigh - price) / thresholdHigh;
  const pAboveLow = distanceToProbability(distAboveLow, cfg.volatilityScale);
  const pBelowHigh = distanceToProbability(distBelowHigh, cfg.volatilityScale);
  const probability = pAboveLow * pBelowHigh;

  // confidence comes from distance to the *nearest* boundary — right at
  // either edge is exactly where this estimator has the least edge
  const nearestDist = Math.min(Math.abs(distAboveLow), Math.abs(distBelowHigh));
  const confidence = Math.min(1, nearestDist / cfg.volatilityScale);

  return { probability, confidence };
}

export const cryptoEstimator: Estimator = {
  category: "crypto",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = CRYPTO_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const price = await fetchSpotPrice(cfg.coingeckoId);
    const { probability, confidence } =
      cfg.comparator === "between" ? estimateBetween(price, cfg) : estimateSingleSided(price, cfg);

    const thresholdLabel =
      cfg.comparator === "between"
        ? `between $${cfg.thresholdLow!.toLocaleString()}-$${cfg.thresholdHigh!.toLocaleString()}`
        : `${cfg.comparator} $${cfg.threshold!.toLocaleString()}`;

    return {
      probability,
      confidence,
      rationale: `${cfg.coingeckoId} spot $${price.toLocaleString()} vs ${thresholdLabel}`,
    };
  },
};
