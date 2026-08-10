import type { Estimator, Estimate, MarketContext } from "./types.js";
import { ANNOUNCEMENT_MARKETS } from "../config/markets.js";
import { gdeltFetch } from "../lib/gdeltThrottle.js";

interface Article {
  title: string;
  seendate: string;
}

async function searchRecentArticles(query: string): Promise<Article[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&format=json&timespan=3d&maxrecords=20`;
  const res = await gdeltFetch(url);
  if (!res.ok) throw new Error(`GDELT request failed: ${res.status}`);
  const json = await res.json();
  return json?.articles ?? [];
}

function daysUntil(iso: string): number {
  return Math.max(0, (new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * "Has this specific thing been announced yet?" markets, not threshold
 * markets — GDELT hits on a tightly-scoped query are themselves the
 * evidence. A real hit means real coverage exists; silence close to the
 * deadline is itself informative (nothing to report = probably hasn't
 * happened), same logic as the SpaceX "no scheduled launch" case.
 */
export const announcementEstimator: Estimator = {
  category: "tech",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = ANNOUNCEMENT_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const articles = await searchRecentArticles(cfg.gdeltQuery);
    const daysLeft = daysUntil(cfg.deadline);
    const count = articles.length;

    if (count === 0) {
      return {
        probability: 0.1,
        confidence: Math.min(0.7, 0.25 + (7 - daysLeft) * 0.06),
        rationale: `GDELT: no recent coverage for "${cfg.gdeltQuery}", ${daysLeft.toFixed(1)}d to deadline`,
      };
    }

    return {
      probability: Math.min(0.85, 0.5 + count * 0.07),
      confidence: Math.min(0.75, 0.3 + count * 0.08),
      rationale: `GDELT: ${count} recent article(s) for "${cfg.gdeltQuery}" — e.g. "${articles[0].title}"`,
    };
  },
};
