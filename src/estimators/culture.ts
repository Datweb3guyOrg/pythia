import type { Estimator, Estimate, MarketContext } from "./types.js";
import { CULTURE_MARKETS } from "../config/markets.js";

interface GlobalRow {
  week: string;
  category: string;
  weeklyRank: number;
  showTitle: string;
}

/**
 * Netflix's per-country public TSV (all-weeks-countries.tsv) excludes the
 * United States entirely — it's only shown live on the site itself, which
 * has no stable public API without a headless browser. This uses the
 * global "Films (English)" list as a proxy instead: same underlying data
 * pipeline, correlated with the US list but not identical (confirmed by
 * direct comparison — they diverge past rank 2), so confidence is capped
 * low, same treatment as the GDELT politics estimator.
 */
async function fetchLatestGlobalFilms(): Promise<GlobalRow[]> {
  const res = await fetch("https://www.netflix.com/tudum/top10/data/all-weeks-global.tsv");
  if (!res.ok) throw new Error(`Netflix Top10 request failed: ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n");
  const rows = lines.slice(1).map((line) => {
    const [week, category, weeklyRank, showTitle] = line.split("\t");
    return { week, category, weeklyRank: Number(weeklyRank), showTitle };
  });

  const filmRows = rows.filter((r) => r.category === "Films (English)");
  if (filmRows.length === 0) return [];
  const latestWeek = filmRows.reduce((a, b) => (a.week > b.week ? a : b)).week;
  return filmRows.filter((r) => r.week === latestWeek);
}

export const cultureEstimator: Estimator = {
  category: "culture",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = CULTURE_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const rows = await fetchLatestGlobalFilms();
    if (rows.length === 0) return null;

    const match = rows.find((r) => r.showTitle === cfg.targetTitle);

    let probability: number;
    if (!match) {
      probability = 0.05; // not even trending globally — strong lean No
    } else if (match.weeklyRank === 1) {
      probability = 0.75; // capped below crypto/econ-tier confidence — still a proxy
    } else {
      probability = Math.max(0.05, 0.3 - (match.weeklyRank - 2) * 0.03);
    }

    return {
      probability,
      // capped just above sizing's confidence threshold (0.4) — low enough to
      // reflect this is a proxy, high enough to actually be able to trade when
      // the read is clear, matching how politics.ts caps at 0.45 for the same reason
      confidence: 0.42,
      rationale: match
        ? `Netflix global Films (English) rank #${match.weeklyRank} for "${cfg.targetTitle}" (week ${rows[0].week}) — proxy for US-only list`
        : `"${cfg.targetTitle}" not in latest global Films (English) top 10 (week ${rows[0].week}) — proxy for US-only list`,
    };
  },
};
