/**
 * Per-market metadata the estimators need to turn a market question into a
 * concrete, checkable comparison. Filled in from the real curated market
 * list pulled via `scripts/dump-markets.mjs` once trading opened (Aug 10).
 * Every market's on-chain `dataSources` field names the exact source its AI
 * oracle settles against — configs below point at those sources directly
 * wherever practical, rather than a generic substitute.
 */

export interface CryptoMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  coingeckoId: string; // e.g. "bitcoin"
  comparator: ">" | "<" | ">=" | "<=" | "between";
  threshold?: number; // USD, for single-sided comparators
  thresholdLow?: number; // USD, for "between"
  thresholdHigh?: number; // USD, for "between"
  /** how much price movement (fraction) maps to full confidence swing */
  volatilityScale: number;
}

export const CRYPTO_MARKETS: CryptoMarketConfig[] = [
  {
    // "Will Bitcoin's CoinGecko daily close on 2026-08-10 UTC be between $64,000 and $66,000?"
    marketAddress: "0x719f25b62ccb7906f82243edae7cab19dfee9ec0",
    outcomeIdx: 0, // "Yes"
    coingeckoId: "bitcoin",
    comparator: "between",
    thresholdLow: 64_000,
    thresholdHigh: 66_000,
    volatilityScale: 0.02, // narrow $2k band on a same-day close — tight scale
  },
  {
    // "Will Ethereum's CoinGecko daily close on 2026-08-16 UTC be $1,890 or higher?"
    marketAddress: "0xdc90c677aee2b74dd060bfa2eff00a27d4d4ca1b",
    outcomeIdx: 0, // "Yes"
    coingeckoId: "ethereum",
    comparator: ">=",
    threshold: 1890,
    volatilityScale: 0.05,
  },
];

/**
 * Three econ shapes, all pointed at the BLS public API directly (the
 * dataSources field on every economics market here names bls.gov, not
 * FRED) — no API key required for the unregistered tier we're using.
 *
 * - "threshold": latest observation vs. a fixed number
 * - "yoy_compare": two series' year-over-year change, compared to each other
 * - "mom_compare": one series, two specific months, compared to each other
 *
 * All three correctly return null (no trade) until BLS actually publishes
 * the month in question — which for two of today's markets is Aug 12, two
 * days out. That's not a bug: trading the gap the instant real data lands
 * is the whole strategy for this category.
 */
export type EconMarketConfig =
  | {
      kind: "threshold";
      marketAddress: `0x${string}`;
      outcomeIdx: number;
      seriesId: string;
      comparator: ">" | "<" | ">=" | "<=";
      threshold: number;
    }
  | {
      kind: "yoy_compare";
      marketAddress: `0x${string}`;
      outcomeIdx: number;
      seriesA: string; // "Yes" means seriesA's YoY exceeds seriesB's YoY
      seriesB: string;
      year: number;
      month: number; // 1-12, the month being compared YoY
    }
  | {
      kind: "mom_compare";
      marketAddress: `0x${string}`;
      outcomeIdx: number;
      seriesId: string;
      earlierYear: number;
      earlierMonth: number;
      laterYear: number;
      laterMonth: number;
      risingMeansYes: boolean;
    };

export const ECON_MARKETS: EconMarketConfig[] = [
  {
    // "Will US core CPI (YoY) exceed headline CPI (YoY) for July 2026, per the BLS CPI release?"
    kind: "yoy_compare",
    marketAddress: "0x9e51ae58500a3ad19017af2eb4d846359b1c7ae7",
    outcomeIdx: 0, // "Yes"
    seriesA: "CUUR0000SA0L1E", // core CPI-U, NSA, all items less food & energy
    seriesB: "CUUR0000SA0", // headline CPI-U, NSA, all items
    year: 2026,
    month: 7,
  },
  {
    // "Will BLS show US average price for eggs ... rise from June to July 2026?"
    kind: "mom_compare",
    marketAddress: "0x1db6058367342c4f604d1a0e01566ff2f6481b9d",
    outcomeIdx: 0, // "Yes"
    seriesId: "APU0000708111",
    earlierYear: 2026,
    earlierMonth: 6,
    laterYear: 2026,
    laterMonth: 7,
    risingMeansYes: true,
  },
];

export interface WeatherMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  latitude: number;
  longitude: number;
  /** ISO date (YYYY-MM-DD) the market resolves against */
  resolveDate: string;
  variable: "precipitation_probability" | "temperature_max" | "temperature_min";
  comparator: ">" | "<" | ">=" | "<=" | "=";
  threshold: number;
  /** true for hurricane/tail-event style questions — caps confidence lower */
  isTailEvent?: boolean;
}

export const WEATHER_MARKETS: WeatherMarketConfig[] = [
  {
    // "Will Wellington Airport (NZWN) hit a daily high of exactly 15°C on Aug 13, 2026 NZST?"
    marketAddress: "0xb13bc65ea2c2600f74a4634abf55c65deb6d0edc",
    outcomeIdx: 0, // "Yes"
    latitude: -41.3272,
    longitude: 174.8053,
    resolveDate: "2026-08-13",
    variable: "temperature_max",
    comparator: "=",
    threshold: 15,
  },
  {
    // "Will Tokyo's highest temperature on Aug 15, 2026 (JST) be above 31.5°C?"
    marketAddress: "0xdec196c2f18307998991ff30655a62ab97cb6369",
    outcomeIdx: 0, // "Yes"
    latitude: 35.6764,
    longitude: 139.6500,
    resolveDate: "2026-08-15",
    variable: "temperature_max",
    comparator: ">",
    threshold: 31.5,
  },
];

export interface SunspotMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** ISO date (YYYY-MM-DD) the SILSO estimate applies to */
  resolveDate: string;
  comparator: ">" | "<" | ">=" | "<=";
  threshold: number;
}

export const SUNSPOT_MARKETS: SunspotMarketConfig[] = [
  {
    // "Will the SILSO estimated sunspot number for 2026-08-12 UTC be 40 or higher?"
    marketAddress: "0x2907372d7be71fe8ea1573daafed1870fc9fcf68",
    outcomeIdx: 0, // "Yes"
    resolveDate: "2026-08-12",
    comparator: ">=",
    threshold: 40,
  },
];

export interface SeaIceMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** ISO date (YYYY-MM-DD) the NSIDC extent reading applies to */
  resolveDate: string;
  comparator: ">" | "<" | ">=" | "<=";
  threshold: number; // million km²
}

export const SEA_ICE_MARKETS: SeaIceMarketConfig[] = [
  {
    // "Will NSIDC Arctic sea ice extent for 2026-08-12 (UTC) be below 5.88 million km²?"
    marketAddress: "0xf00cfaf8fc8f84f0a1d6151a5cf466c996901e9f",
    outcomeIdx: 0, // "Yes"
    resolveDate: "2026-08-12",
    comparator: "<",
    threshold: 5.88,
  },
];

export interface SpaceLaunchMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** search term for the Launch Library 2 API — verified against the live
   * API: Dragon CRS missions are catalogued as "SpX-N", not "CRS-N" */
  launchQuery: string;
  /** ISO datetime deadline the launch must occur before */
  deadline: string;
}

export const SPACE_LAUNCH_MARKETS: SpaceLaunchMarketConfig[] = [
  {
    // "Will SpaceX launch the Dragon CRS-35 cargo mission before 00:00 UTC on Aug 14, 2026?"
    // Confirmed live: "Dragon CRS-2 SpX-35" shows net=2026-12-31 at "Quarter 4"
    // precision — a placeholder, not a real date. Strong early "No" signal.
    marketAddress: "0xa66a47aac290f8dec9c809166fc6cd703966d64b",
    outcomeIdx: 0, // "Yes"
    launchQuery: "SpX-35",
    deadline: "2026-08-14T00:00:00Z",
  },
];

export interface AnnouncementMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** GDELT DOC 2.0 query tuned tight enough that any hit is meaningful */
  gdeltQuery: string;
  /** ISO datetime deadline the announcement must happen before */
  deadline: string;
}

export const ANNOUNCEMENT_MARKETS: AnnouncementMarketConfig[] = [
  {
    // "Will OpenAI publicly release a model named Astra before 03:59 UTC on Aug 14, 2026?"
    marketAddress: "0x9b7e3199c73ca293626ab886d8e1601c33d58ccb",
    outcomeIdx: 0, // "Yes"
    gdeltQuery: '"OpenAI" "Astra" (release OR launch OR announce)',
    deadline: "2026-08-14T03:59:00Z",
  },
  {
    // "Will Take-Two or Rockstar disclose a numeric GTA VI preorder figure by 03:59 UTC on Aug 14, 2026?"
    marketAddress: "0x260838dea933ec339270a8565cf8601b58a85db2",
    outcomeIdx: 0, // "Yes"
    // was `"GTA"` — GDELT's phrase search rejects quoted phrases that short
    // ("The specified phrase is too short"), which silently broke this
    // query for every single pass. "GTA VI" is both longer and more precise.
    gdeltQuery: '("Take-Two" OR "Rockstar") "GTA VI" preorder',
    deadline: "2026-08-14T03:59:00Z",
  },
];

export interface CultureMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** exact show_title as it appears in Netflix's public Top10 TSV dataset */
  targetTitle: string;
}

export const CULTURE_MARKETS: CultureMarketConfig[] = [
  {
    // "Will 'A Quiet Place: Day One' be the #1 US movie in the Netflix Top 10 list published Aug 11, 2026?"
    // No public US-only feed exists (Netflix's countries TSV excludes the US;
    // it's only broken out on the site itself, which has no stable API) — this
    // uses the global "Films (English)" list as a proxy, hence capped confidence.
    marketAddress: "0x41026490b1882d909200bacab10ea15bb9a07314",
    outcomeIdx: 0, // "Yes"
    targetTitle: "A Quiet Place: Day One",
  },
];

export interface PoliticsMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** GDELT DOC 2.0 query string, e.g. '"immigration bill" AND congress' */
  gdeltQuery: string;
  /** does rising positive coverage/volume support this outcome being "yes"? */
  favorsYesWhen: "positive" | "negative";
}

export const POLITICS_MARKETS: PoliticsMarketConfig[] = [
  {
    // "Will Trump send at least 5 nominations to the US Senate during Aug 9-15, 2026?"
    marketAddress: "0xb8fcc2c60d686b3978dd002bc20e9a4a5868f5c5",
    outcomeIdx: 0, // "Yes"
    gdeltQuery: '"Trump" "nominations" "Senate"',
    favorsYesWhen: "positive",
  },
  {
    // "Will a Mamdani non-emergency NYC executive order dated Aug 9-15, 2026 be publicly posted by settlement?"
    marketAddress: "0xa9b716afe262c6ee69eee5979b553c95abead376",
    outcomeIdx: 0, // "Yes"
    gdeltQuery: '"Mamdani" "executive order" NYC',
    favorsYesWhen: "positive",
  },
  {
    // "Will the Federal Register publish 6+ Presidential documents with publication dates Aug 12-18, 2026?"
    marketAddress: "0x9face9fff97f8b240e5bf3be24f303742e2c040a",
    outcomeIdx: 0, // "Yes"
    gdeltQuery: '"Federal Register" "presidential" document',
    favorsYesWhen: "positive",
  },
];

export interface SportsMarketConfig {
  marketAddress: `0x${string}`;
  outcomeIdx: number;
  /** The Odds API sport key — free tier only covers these two */
  sportKey: "basketball_nba" | "baseball_mlb";
  /** exact team name as returned by The Odds API, whose win this outcome represents */
  team: string;
}

export const SPORTS_MARKETS: SportsMarketConfig[] = [
  // both live sports markets are soccer (Juventus, NSÍ Runavík vs FC Lugano) —
  // The Odds API free tier only covers NBA/MLB, so neither can be mapped yet.
  // Lowest priority per plan; needs a different odds source before these can trade.
];
