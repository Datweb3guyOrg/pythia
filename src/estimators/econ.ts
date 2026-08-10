import type { Estimator, Estimate, MarketContext } from "./types.js";
import { ECON_MARKETS } from "../config/markets.js";

interface BlsRow {
  year: number;
  month: number; // 1-12
  value: number;
}

/**
 * BLS public API v1, unregistered tier — no key required, capped query
 * limits, which is fine for this scaffold's request volume. Every economics
 * market's on-chain dataSources points at bls.gov directly, not FRED, so
 * this hits the same source the oracle will settle against.
 */
async function fetchBlsSeries(seriesId: string, startYear: number, endYear: number): Promise<BlsRow[]> {
  const url = `https://api.bls.gov/publicAPI/v1/timeseries/data/${seriesId}?startyear=${startYear}&endyear=${endYear}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`BLS request failed: ${res.status}`);
  const json = await res.json();
  const data = json?.Results?.series?.[0]?.data ?? [];
  return data
    .map((d: any) => ({ year: Number(d.year), month: Number(String(d.period).replace("M", "")), value: Number(d.value) }))
    .filter((r: BlsRow) => !Number.isNaN(r.value) && r.month >= 1 && r.month <= 12);
}

function findValue(rows: BlsRow[], year: number, month: number): number | undefined {
  return rows.find((r) => r.year === year && r.month === month)?.value;
}

export const econEstimator: Estimator = {
  category: "economics",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = ECON_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    if (cfg.kind === "threshold") {
      const rows = await fetchBlsSeries(cfg.seriesId, new Date().getFullYear() - 1, new Date().getFullYear());
      if (rows.length === 0) return null;
      const latest = rows.reduce((a, b) => (a.year * 12 + a.month > b.year * 12 + b.month ? a : b));
      const meetsThreshold =
        cfg.comparator === ">" ? latest.value > cfg.threshold :
        cfg.comparator === ">=" ? latest.value >= cfg.threshold :
        cfg.comparator === "<" ? latest.value < cfg.threshold :
        latest.value <= cfg.threshold;
      return {
        probability: meetsThreshold ? 0.92 : 0.08,
        confidence: 0.85,
        rationale: `BLS ${cfg.seriesId} ${latest.year}-${latest.month} = ${latest.value} vs threshold ${cfg.threshold} (${cfg.comparator})`,
      };
    }

    if (cfg.kind === "yoy_compare") {
      const rows = await fetchBlsSeries(cfg.seriesA, cfg.year - 1, cfg.year);
      const rowsB = await fetchBlsSeries(cfg.seriesB, cfg.year - 1, cfg.year);
      const curA = findValue(rows, cfg.year, cfg.month);
      const priorA = findValue(rows, cfg.year - 1, cfg.month);
      const curB = findValue(rowsB, cfg.year, cfg.month);
      const priorB = findValue(rowsB, cfg.year - 1, cfg.month);
      if (curA === undefined || priorA === undefined || curB === undefined || priorB === undefined) {
        return null; // this month hasn't been published by BLS yet — correct to skip
      }
      const yoyA = ((curA - priorA) / priorA) * 100;
      const yoyB = ((curB - priorB) / priorB) * 100;
      const diff = yoyA - yoyB;
      // both series are official published figures once available — this is
      // near ground truth, not a forecast, so the logistic is just a
      // narrow-scale tiebreaker for near-zero differences
      const probability = 1 / (1 + Math.exp(-diff / 0.15));
      return {
        probability,
        confidence: 0.92,
        rationale: `BLS ${cfg.seriesA} YoY ${yoyA.toFixed(2)}% vs ${cfg.seriesB} YoY ${yoyB.toFixed(2)}% (${cfg.year}-${cfg.month})`,
      };
    }

    // mom_compare
    const rows = await fetchBlsSeries(cfg.seriesId, cfg.earlierYear, cfg.laterYear);
    const earlier = findValue(rows, cfg.earlierYear, cfg.earlierMonth);
    const later = findValue(rows, cfg.laterYear, cfg.laterMonth);
    if (earlier === undefined || later === undefined) {
      return null; // later month not published yet — correct to skip
    }
    const rose = later > earlier;
    const matches = rose === cfg.risingMeansYes;
    return {
      probability: matches ? 0.92 : 0.08,
      confidence: 0.9,
      rationale: `BLS ${cfg.seriesId} ${earlier} (${cfg.earlierYear}-${cfg.earlierMonth}) -> ${later} (${cfg.laterYear}-${cfg.laterMonth}), rose=${rose}`,
    };
  },
};
