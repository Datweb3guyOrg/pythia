import type { Estimator, Estimate, MarketContext } from "./types.js";
import { SPACE_LAUNCH_MARKETS } from "../config/markets.js";

const ROUGH_PRECISIONS = new Set(["Month", "Quarter", "Half Year", "Year", "TBD"]);

interface LaunchResult {
  name: string;
  net: string;
  net_precision?: { name: string };
}

async function searchLaunches(query: string): Promise<LaunchResult[]> {
  const url = `https://ll.thespacedevs.com/2.2.0/launch/?search=${encodeURIComponent(query)}&mode=list&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Launch Library request failed: ${res.status}`);
  const json = await res.json();
  return json?.results ?? [];
}

function daysUntil(iso: string): number {
  return Math.max(0, (new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/**
 * Launch Library 2 is the same public tracker NASA/SpaceX-watchers use —
 * not the literal dataSources listed on-chain (nasa.gov, spacex.com), but a
 * comprehensive aggregator of the same schedule info. A launch with only a
 * rough precision (Month/Quarter/Year placeholder) means nothing concrete
 * is actually scheduled yet, which is itself a strong "No" signal this
 * close to a deadline.
 */
export const spacexLaunchEstimator: Estimator = {
  category: "tech",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = SPACE_LAUNCH_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const results = await searchLaunches(cfg.launchQuery);
    const daysLeft = daysUntil(cfg.deadline);

    if (results.length === 0) {
      // nothing in the schedule at all — confidence in "No" grows the
      // closer we get to the deadline with no listing
      return {
        probability: 0.05,
        confidence: Math.min(0.85, 0.4 + (7 - daysLeft) * 0.05),
        rationale: `Launch Library: no match for "${cfg.launchQuery}", ${daysLeft.toFixed(1)}d to deadline`,
      };
    }

    const launch = results[0];
    const precision = launch.net_precision?.name ?? "unknown";
    const netDate = new Date(launch.net);
    const beforeDeadline = netDate.getTime() <= new Date(cfg.deadline).getTime();

    if (ROUGH_PRECISIONS.has(precision)) {
      // a placeholder date (e.g. "2026-12-31" at Quarter precision) is not
      // a real schedule commitment — treat like "no concrete launch date"
      return {
        probability: 0.08,
        confidence: Math.min(0.8, 0.35 + (7 - daysLeft) * 0.05),
        rationale: `Launch Library: "${launch.name}" only has ${precision}-level placeholder (${launch.net}), no concrete date before deadline`,
      };
    }

    return {
      probability: beforeDeadline ? 0.9 : 0.05,
      confidence: 0.85,
      rationale: `Launch Library: "${launch.name}" scheduled ${launch.net} (${precision} precision), ${beforeDeadline ? "before" : "after"} deadline ${cfg.deadline}`,
    };
  },
};
