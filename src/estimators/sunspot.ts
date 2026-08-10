import type { Estimator, Estimate, MarketContext } from "./types.js";
import { SUNSPOT_MARKETS } from "../config/markets.js";

interface EisnRow {
  date: string; // YYYY-MM-DD
  value: number;
}

/** SILSO's daily estimated international sunspot number, fixed-width text */
async function fetchRecentEisn(): Promise<EisnRow[]> {
  const res = await fetch("https://www.sidc.be/SILSO/DATA/EISN/EISN_current.txt");
  if (!res.ok) throw new Error(`SILSO request failed: ${res.status}`);
  const text = await res.text();
  return text
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const [year, month, day] = parts;
      const value = Number(parts[4]);
      return { date: `${year}-${month}-${day}`, value };
    })
    .filter((r) => !Number.isNaN(r.value));
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

/** no clean per-day forecast exists for sunspot number — this projects
 * forward from the recent trend and lets forecast uncertainty (recent
 * volatility) do the work a real model would, same role as crypto's
 * volatilityScale, just derived from data instead of hand-set */
export const sunspotEstimator: Estimator = {
  category: "miscellaneous",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = SUNSPOT_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const rows = await fetchRecentEisn();
    if (rows.length < 5) return null;

    // if the resolve date is already published, use it directly — full confidence
    const exact = rows.find((r) => r.date === cfg.resolveDate);

    const recent = rows.slice(-7).map((r) => r.value);
    const projected = exact ? exact.value : mean(recent.slice(-3)); // short-term mean as the projection
    const scale = Math.max(5, stddev(recent)); // floor avoids a falsely-confident zero-volatility read

    const distance = (projected - cfg.threshold) / scale;
    const pAbove = 1 / (1 + Math.exp(-distance));
    const probability = cfg.comparator === ">" || cfg.comparator === ">=" ? pAbove : 1 - pAbove;

    const days = daysUntil(cfg.resolveDate);
    const horizonConfidence = exact ? 0.9 : Math.max(0.1, 0.7 - days * 0.2);
    const confidence = Math.min(horizonConfidence, Math.abs(distance) / 2);

    return {
      probability,
      confidence,
      rationale: exact
        ? `SILSO EISN published for ${cfg.resolveDate}: ${exact.value} vs threshold ${cfg.threshold}`
        : `SILSO EISN recent trend projects ~${projected.toFixed(0)} (7d stddev ${scale.toFixed(1)}) for ${cfg.resolveDate}, ${days.toFixed(1)}d out, vs threshold ${cfg.threshold}`,
    };
  },
};
