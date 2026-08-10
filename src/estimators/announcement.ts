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

// article count alone treats "will be generally available" and "hits the
// brakes" as equally positive signal — this keyword pass at least tells
// confirming coverage apart from coverage suggesting delay/denial
const POSITIVE_WORDS = ["release", "released", "launch", "launched", "available", "ships", "shipping", "live", "unveil", "unveiled", "debut", "confirms", "confirmed"];
const NEGATIVE_WORDS = ["delay", "delayed", "postpone", "postponed", "pause", "paused", "brakes", "cancel", "canceled", "cancelled", "scrap", "scrapped", "denies", "denied", "not release", "no plans", "holds off"];

function classify(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  const hasNegative = NEGATIVE_WORDS.some((w) => lower.includes(w));
  const hasPositive = POSITIVE_WORDS.some((w) => lower.includes(w));
  if (hasNegative) return "negative"; // a delay/denial headline overrides a co-occurring positive word
  if (hasPositive) return "positive";
  return "neutral";
}

/**
 * "Has this specific thing been announced yet?" markets, not threshold
 * markets — GDELT hits on a tightly-scoped query are themselves the
 * evidence. A real hit means real coverage exists; silence close to the
 * deadline is itself informative (nothing to report = probably hasn't
 * happened), same logic as the SpaceX "no scheduled launch" case.
 *
 * Net positive-minus-negative headline count drives direction; a mixed
 * batch (both positive and negative present) is genuine ambiguity, not
 * confidence, so it caps lower than a one-sided batch of the same size.
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

    if (articles.length === 0) {
      return {
        probability: 0.1,
        confidence: Math.min(0.7, 0.25 + (7 - daysLeft) * 0.06),
        rationale: `GDELT: no recent coverage for "${cfg.gdeltQuery}", ${daysLeft.toFixed(1)}d to deadline`,
      };
    }

    const classified = articles.map((a) => ({ ...a, sentiment: classify(a.title) }));
    const positive = classified.filter((a) => a.sentiment === "positive").length;
    const negative = classified.filter((a) => a.sentiment === "negative").length;
    const net = positive - negative;
    const isMixed = positive > 0 && negative > 0;

    const probability = Math.max(0.08, Math.min(0.85, 0.5 + net * 0.09));

    // mixed signal genuinely means less certainty, not just a smaller count
    const baseConfidence = 0.3 + Math.abs(net) * 0.08;
    const confidence = Math.min(0.75, isMixed ? baseConfidence * 0.6 : baseConfidence);

    const example = classified.find((a) => a.sentiment === (net >= 0 ? "positive" : "negative")) ?? classified[0];

    return {
      probability,
      confidence,
      rationale: `GDELT: ${positive} positive / ${negative} negative / ${classified.length - positive - negative} neutral for "${cfg.gdeltQuery}"${isMixed ? " (mixed signal)" : ""} — e.g. "${example.title}"`,
    };
  },
};
