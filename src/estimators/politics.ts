import type { Estimator, Estimate, MarketContext } from "./types.js";
import { POLITICS_MARKETS } from "../config/markets.js";
import { gdeltFetchJson } from "../lib/gdeltThrottle.js";

interface TimelinePoint {
  date: string;
  value: number;
}

/** GDELT's timeline modes return { timeline: [{ series, data: [{date, value}] }] } */
async function fetchTimeline(query: string, mode: "timelinetone" | "timelinevolraw"): Promise<TimelinePoint[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=${mode}&format=json&timespan=7d`;
  const json = await gdeltFetchJson(url);
  const data = json?.timeline?.[0]?.data;
  if (!Array.isArray(data)) return [];
  return data.map((d: any) => ({ date: d.date, value: Number(d.value) })).filter((d: TimelinePoint) => !Number.isNaN(d.value));
}

function average(points: TimelinePoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, p) => sum + p.value, 0) / points.length;
}

/** GDELT tone runs roughly -10..+10 — this is a noisy proxy, not ground truth,
 * so probability shift and confidence are both capped conservatively. */
export const politicsEstimator: Estimator = {
  category: "politics",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = POLITICS_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const [tone, volume] = await Promise.all([
      fetchTimeline(cfg.gdeltQuery, "timelinetone"),
      fetchTimeline(cfg.gdeltQuery, "timelinevolraw"),
    ]);
    if (tone.length < 3 || volume.length < 3) return null; // not enough coverage to say anything

    const recentTone = average(tone.slice(-2));
    const baselineTone = average(tone.slice(0, -2));
    const toneShift = recentTone - baselineTone;

    const recentVol = volume.slice(-2).reduce((s, p) => s + p.value, 0);
    const baselineVolAvg = average(volume.slice(0, -2));
    const volMomentum = baselineVolAvg > 0 ? (recentVol / 2 - baselineVolAvg) / baselineVolAvg : 0;

    const signedShift = cfg.favorsYesWhen === "positive" ? toneShift : -toneShift;
    const probability = 0.5 + Math.max(-0.25, Math.min(0.25, signedShift * 0.03));

    // confidence comes from coverage momentum, not tone magnitude — a big
    // swing on thin coverage is noise, not signal. Hard-capped: this
    // estimator is a proxy, never treated as high-confidence like crypto/econ.
    const confidence = Math.max(0, Math.min(0.45, Math.abs(volMomentum) * 0.3));

    return {
      probability,
      confidence,
      rationale: `GDELT "${cfg.gdeltQuery}" tone shift ${toneShift.toFixed(2)}, volume momentum ${(volMomentum * 100).toFixed(0)}%`,
    };
  },
};
