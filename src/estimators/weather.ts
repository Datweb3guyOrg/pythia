import type { Estimator, Estimate, MarketContext } from "./types.js";
import { WEATHER_MARKETS, type WeatherMarketConfig } from "../config/markets.js";

interface DailyForecast {
  precipitationProbability?: number; // 0-100, already calibrated
  temperatureMax?: number; // celsius
  temperatureMin?: number; // celsius
}

async function fetchForecast(lat: number, lon: number, date: string): Promise<DailyForecast> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${date}&end_date=${date}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo request failed: ${res.status}`);
  const json = await res.json();
  return {
    precipitationProbability: json?.daily?.precipitation_probability_max?.[0],
    temperatureMax: json?.daily?.temperature_2m_max?.[0],
    temperatureMin: json?.daily?.temperature_2m_min?.[0],
  };
}

/** two independent model runs — their disagreement is the confidence signal for temperature markets */
async function fetchModelSpread(lat: number, lon: number, date: string, variable: "temperature_max" | "temperature_min") {
  const field = variable === "temperature_max" ? "temperature_2m_max" : "temperature_2m_min";
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=${field}&timezone=auto&start_date=${date}&end_date=${date}` +
    `&models=gfs_seamless,ecmwf_ifs025`;
  const res = await fetch(url);
  if (!res.ok) return null; // spread is a confidence booster, not required — degrade gracefully
  const json = await res.json();
  const gfs = json?.daily?.[`${field}_gfs_seamless`]?.[0];
  const ecmwf = json?.daily?.[`${field}_ecmwf_ifs025`]?.[0];
  if (typeof gfs !== "number" || typeof ecmwf !== "number") return null;
  return Math.abs(gfs - ecmwf);
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr + "T00:00:00Z").getTime() - Date.now();
  return Math.max(0, ms / 86_400_000);
}

/** forecast skill is near-climatology beyond ~10 days out, sharp inside ~3 */
function horizonConfidence(days: number): number {
  return Math.max(0.05, Math.min(0.9, 1 - days / 10));
}

function distanceToProbability(value: number, threshold: number, comparator: string, scale: number): number {
  const distanceFraction = (value - threshold) / scale;
  const p = 1 / (1 + Math.exp(-distanceFraction));
  return comparator === ">" || comparator === ">=" ? p : 1 - p;
}

export const weatherEstimator: Estimator = {
  category: "miscellaneous",
  async estimate(ctx: MarketContext): Promise<Estimate | null> {
    const cfg = WEATHER_MARKETS.find(
      (m) => m.marketAddress === ctx.marketAddress && m.outcomeIdx === ctx.outcomeIdx
    );
    if (!cfg) return null;

    const days = daysUntil(cfg.resolveDate);
    let confidence = horizonConfidence(days);
    if (cfg.isTailEvent) confidence *= 0.5;

    const forecast = await fetchForecast(cfg.latitude, cfg.longitude, cfg.resolveDate);

    if (cfg.variable === "precipitation_probability") {
      if (forecast.precipitationProbability === undefined) return null;
      // already a calibrated probability — use it directly rather than
      // re-deriving one through a threshold comparison
      return {
        probability: forecast.precipitationProbability / 100,
        confidence,
        rationale: `Open-Meteo precip probability ${forecast.precipitationProbability}% for ${cfg.resolveDate}, ${days.toFixed(1)}d out`,
      };
    }

    const value = cfg.variable === "temperature_max" ? forecast.temperatureMax : forecast.temperatureMin;
    if (value === undefined) return null;

    const spread = await fetchModelSpread(cfg.latitude, cfg.longitude, cfg.resolveDate, cfg.variable);
    if (spread !== null) {
      // >5C model disagreement kills confidence; tight agreement leaves it untouched
      confidence *= Math.max(0.2, 1 - spread / 5);
    }

    const probability = distanceToProbability(value, cfg.threshold, cfg.comparator, 3 /* deg C scale */);

    return {
      probability,
      confidence,
      rationale: `Open-Meteo ${cfg.variable} ${value}C vs threshold ${cfg.threshold}C (${cfg.comparator}), ${days.toFixed(1)}d out${spread !== null ? `, model spread ${spread.toFixed(1)}C` : ""}`,
    };
  },
};

export type { WeatherMarketConfig };
