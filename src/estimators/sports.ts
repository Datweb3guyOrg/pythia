import type { Estimator, Estimate, MarketContext } from "./types.js";
import { SPORTS_MARKETS } from "../config/markets.js";

interface OddsOutcome {
  name: string;
  price: number; // decimal odds
}

interface OddsEvent {
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    markets: Array<{ key: string; outcomes: OddsOutcome[] }>;
  }>;
}

async function fetchEvents(sportKey: string): Promise<OddsEvent[]> {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY not set");

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us&markets=h2h&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API request failed: ${res.status}`);
  return res.json();
}

/** de-vig one bookmaker's h2h market: normalize implied probabilities so they sum to 1 */
function deVig(outcomes: OddsOutcome[], team: string): number | null {
  const implied = outcomes.map((o) => ({ name: o.name, p: 1 / o.price }));
  const overround = implied.reduce((s, o) => s + o.p, 0);
  if (overround === 0) return null;
  const target = implied.find((o) => o.name === team);
  if (!target) return null;
  return target.p / overround;
}

export const sportsEstimator: Estimator = {
  category: "sports",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = SPORTS_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const events = await fetchEvents(cfg.sportKey);
    const event = events.find((e) => e.home_team === cfg.team || e.away_team === cfg.team);
    if (!event) return null;

    const probs: number[] = [];
    for (const bookmaker of event.bookmakers) {
      const h2h = bookmaker.markets.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const p = deVig(h2h.outcomes, cfg.team);
      if (p !== null) probs.push(p);
    }
    if (probs.length === 0) return null;

    const probability = probs.reduce((s, p) => s + p, 0) / probs.length;
    // sportsbook consensus is sharp — confidence grows with how many
    // independent books agree, capped well below certainty
    const confidence = Math.min(0.75, 0.25 + probs.length * 0.1);

    return {
      probability,
      confidence,
      rationale: `de-vigged consensus across ${probs.length} book(s) for ${cfg.team}: ${(probability * 100).toFixed(1)}%`,
    };
  },
};
