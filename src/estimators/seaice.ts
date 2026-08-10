import type { Estimator, Estimate, MarketContext } from "./types.js";
import { SEA_ICE_MARKETS } from "../config/markets.js";

async function fetchSeriesForYear(year: number): Promise<Record<string, number>> {
  const res = await fetch(
    `https://nsidc.org/api/seaiceservice/extent/north/filled_averaged_data/${year}?smoothing_window=0`
  );
  if (!res.ok) throw new Error(`NSIDC request failed: ${res.status}`);
  return res.json();
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr + "T00:00:00Z").getTime() - Date.now();
  return Math.max(0, ms / 86_400_000);
}

function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function stddev(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Arctic summer sea ice extent declines on a strong seasonal trend, unlike
 * sunspot number's noisier walk — so this projects forward with the recent
 * average daily rate of change rather than just a short-term mean. */
export const seaIceEstimator: Estimator = {
  category: "miscellaneous",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = SEA_ICE_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const year = Number(cfg.resolveDate.slice(0, 4));
    const series = await fetchSeriesForYear(year);
    const dates = Object.keys(series).sort();
    if (dates.length < 8) return null;

    const exact = series[cfg.resolveDate];

    const recentDates = dates.slice(-8);
    const recentValues = recentDates.map((d) => series[d]);
    const deltas = recentValues.slice(1).map((v, i) => v - recentValues[i]);
    const avgDailyChange = mean(deltas);
    const scale = Math.max(0.05, stddev(deltas));

    const lastDate = recentDates[recentDates.length - 1];
    const lastValue = series[lastDate];
    const daysFromLast = (new Date(cfg.resolveDate + "T00:00:00Z").getTime() - new Date(lastDate + "T00:00:00Z").getTime()) / 86_400_000;
    const projected = exact ?? lastValue + avgDailyChange * daysFromLast;

    const distance = (projected - cfg.threshold) / scale;
    const pAbove = 1 / (1 + Math.exp(-distance));
    const probability = cfg.comparator === ">" || cfg.comparator === ">=" ? pAbove : 1 - pAbove;

    const days = daysUntil(cfg.resolveDate);
    const horizonConfidence = exact !== undefined ? 0.9 : Math.max(0.15, 0.75 - days * 0.15);
    const confidence = Math.min(horizonConfidence, Math.abs(distance) / 2);

    return {
      probability,
      confidence,
      rationale:
        exact !== undefined
          ? `NSIDC extent published for ${cfg.resolveDate}: ${exact} vs threshold ${cfg.threshold}`
          : `NSIDC extent ${lastValue} on ${lastDate}, trend ${avgDailyChange.toFixed(3)}/day projects ~${projected.toFixed(2)} for ${cfg.resolveDate}, vs threshold ${cfg.threshold}`,
    };
  },
};
