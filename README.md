# Pythia

Autonomous trading agent for the [Delphi Agent Arena Competition](https://dorahacks.io/hackathon/delphi-agent-competition/detail) (Gensyn, Aug 10–24 2026).

Trades only when an estimated probability meaningfully diverges from a market's LMSR-implied price, sized with fractional Kelly and hard exposure caps — not a constantly-active bot.

## Structure

```
src/
  estimators/       one module per market category, each returns { probability, confidence, rationale } or null
    crypto.ts        priority 1 — CoinGecko spot price vs. threshold (objective, near-term resolvable)
    econ.ts          priority 2 — FRED economic series vs. threshold (scheduled-release ground truth)
    politics.ts       priority 3 — GDELT tone/volume momentum vs. a 7-day baseline. Noisy proxy by
                        construction: confidence hard-capped at 0.45, driven by coverage momentum
                        rather than tone magnitude (a big swing on thin coverage is noise, not signal)
    sports.ts         priority 4 — The Odds API, NBA/MLB only on free tier. De-vigs each bookmaker's
                        h2h market and averages across books; confidence scales with book count
    weather.ts         miscellaneous category — Open-Meteo forecast, no API key needed. Confidence
                        scales with days-to-resolution (forecast skill decays past ~10 days) and,
                        for temperature markets, cross-model spread (gfs_seamless vs ecmwf_ifs025).
                        Strategy: re-evaluate daily and trade the gap between the market's stale
                        opening price and the forecast as it sharpens closer to resolution.
  config/markets.ts  hand-mapped market -> data-source config; empty until the curated market list is public
  sizing.ts          fractional-Kelly position sizing with per-market and per-category caps
  agent/run.ts       main loop: discover -> estimate -> size -> quote -> execute
```

## Setup

```bash
npm install
cp .env.example .env   # fill in DELPHI_API_ACCESS_KEY, WALLET_PRIVATE_KEY, FRED_API_KEY
```

## Running

```bash
npm run dry-run   # quote-only, no on-chain execution
npm start          # live trading
```

## Status

- [x] Project scaffolded, `npm install` verified against the real `@gensyn-ai/gensyn-delphi-sdk` package
- [x] `agent/run.ts` typechecks against the SDK's actual types (`listMarkets`, `Market`, quote/buy/sell shapes)
- [x] Sizing + crypto + econ estimators written
- [ ] `config/markets.ts` filled in once the curated competition market list is public
- [x] `sharesOut`/`sharesIn` are 18-decimal shares, not token amounts — `agent/shareSearch.ts` binary-searches `quoteBuy` to convert a token budget into the right share count
- [x] "Sell" decisions no longer call `sellShares` (which requires an existing position we don't track) — a bearish view buys the complementary outcome instead, and is skipped for markets with more than 2 outcomes
- [x] Politics (GDELT) and sports (Odds API) estimators — all five estimators are real implementations now, none are stubs
- [x] Wallet funded, registered, Discord joined
- [ ] Dry-run verified against live competition-testnet markets (Aug 10)

## Confirmed against installed SDK types

- Market categories are exactly: `crypto`, `culture`, `economics`, `miscellaneous`, `politics`, `sports` (not "tech" — dropped)
- `listMarkets({ status, category, pricesAndImpliedProbabilities, competitionId })` — pass `pricesAndImpliedProbabilities: true` to get `spotImpliedProbabilities` per outcome in the same call
- A `Market` carries all outcomes + their spot prices as parallel arrays (`metadata.outcomes`, `spotImpliedProbabilities`) — one context is built per outcome in `buildMarketContexts()`
- `DelphiClientConfig` uses `signerType: "private_key" | "cdp_server_wallet"` (default is CDP, not private key) and `apiKey`, not `apiAccessKey`
