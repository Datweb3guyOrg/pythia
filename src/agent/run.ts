import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";
import type { Market } from "@gensyn-ai/gensyn-delphi-sdk";
import type { Category, MarketContext } from "../estimators/types.js";
import { cryptoEstimator } from "../estimators/crypto.js";
import { econEstimator } from "../estimators/econ.js";
import { politicsEstimator } from "../estimators/politics.js";
import { sportsEstimator } from "../estimators/sports.js";
import { weatherEstimator } from "../estimators/weather.js";
import { sunspotEstimator } from "../estimators/sunspot.js";
import { seaIceEstimator } from "../estimators/seaice.js";
import { spacexLaunchEstimator } from "../estimators/spacex.js";
import { announcementEstimator } from "../estimators/announcement.js";
import { sizePosition, DEFAULT_SIZING } from "../sizing.js";
import { findSharesForTokenBudget } from "./shareSearch.js";
import { loadCategorySpent, saveCategorySpent } from "./state.js";

const QUOTE_ONLY = process.argv.includes("--quote-only");

// Multiple estimators can share a category (e.g. "miscellaneous" has weather,
// sunspot, and sea ice) — each one internally filters by exact marketAddress
// via its own config, so dispatch just tries all of them per market and
// takes the first non-null result rather than picking one by category name.
const estimators = [
  cryptoEstimator,
  econEstimator,
  politicsEstimator,
  sportsEstimator,
  weatherEstimator,
  sunspotEstimator,
  seaIceEstimator,
  spacexLaunchEstimator,
  announcementEstimator,
];
const KNOWN_CATEGORIES = new Set(estimators.map((e) => e.category));

/** flattens each open market's outcomes into one tradeable context per outcome */
function buildMarketContexts(markets: Market[]): MarketContext[] {
  const out: MarketContext[] = [];
  for (const m of markets) {
    if (m.status !== "open") continue;
    if (!m.metadata || !m.spotImpliedProbabilities) continue;
    if (!KNOWN_CATEGORIES.has(m.category as Category)) continue; // e.g. "culture" — no estimator at all

    m.metadata.outcomes.forEach((_outcome, outcomeIdx) => {
      const impliedPrice = m.spotImpliedProbabilities?.[outcomeIdx];
      if (impliedPrice === undefined) return;
      out.push({
        marketAddress: m.id as `0x${string}`,
        outcomeIdx,
        outcomeCount: m.metadata!.outcomes.length,
        question: m.metadata!.question,
        category: m.category as Category,
        impliedPrice,
      });
    });
  }
  return out;
}

async function estimateContext(ctx: MarketContext) {
  for (const estimator of estimators) {
    try {
      const est = await estimator.estimate(ctx);
      if (est) return est;
    } catch (err) {
      // a transient network/API failure on one estimator (rate limit,
      // timeout, upstream outage) should skip that market, not crash the run
      console.warn(`  [${estimator.category}] estimator failed on ${ctx.marketAddress}#${ctx.outcomeIdx}: ${(err as Error).message}`);
    }
  }
  return null;
}

/**
 * Buys sharesOut worth up to tokenBudget tokens on outcomeIdx, applying a
 * 2% slippage buffer on top of the searched quote. Returns whether a trade
 * actually executed — false for quote-only runs or a too-small budget —
 * so the caller only books spend against category exposure for real trades.
 */
async function executeBuy(
  client: DelphiClient,
  marketAddress: `0x${string}`,
  outcomeIdx: number,
  tokenBudget: bigint
): Promise<boolean> {
  const { sharesOut, tokensIn } = await findSharesForTokenBudget(client, marketAddress, outcomeIdx, tokenBudget);
  if (sharesOut === 0n) {
    console.log(`  skip: budget ${tokenBudget} too small to buy a meaningful share count`);
    return false;
  }
  console.log(`  quote: ${tokensIn} tokens in for ${sharesOut} shares (budget ${tokenBudget})`);
  if (QUOTE_ONLY) return false;

  await client.ensureTokenApproval({ marketAddress, minimumAmount: tokensIn });
  const result = await client.buyShares({
    marketAddress,
    outcomeIdx,
    sharesOut,
    maxTokensIn: (tokensIn * 102n) / 100n,
  });
  console.log(`  executed: ${result.transactionHash}`);
  return true;
}

async function main() {
  const client = new DelphiClient({
    network: (process.env.DELPHI_NETWORK as any) ?? "competition-testnet",
    apiKey: process.env.DELPHI_API_ACCESS_KEY,
    signerType: process.env.DELPHI_SIGNER_TYPE === "private_key" ? "private_key" : "cdp_server_wallet",
    privateKey: process.env.WALLET_PRIVATE_KEY as `0x${string}` | undefined,
    cdpApiKeyId: process.env.CDP_API_KEY_ID,
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET,
    cdpWalletSecret: process.env.CDP_WALLET_SECRET,
    cdpWalletAddress: process.env.CDP_WALLET_ADDRESS as `0x${string}` | undefined,
  });

  const categorySpent = await loadCategorySpent();

  const { markets } = await client.listMarkets({
    status: "open",
    limit: 50,
    pricesAndImpliedProbabilities: true,
  });

  const contexts = buildMarketContexts(markets ?? []);
  const bankroll = await client.getErc20Balance();

  for (const ctx of contexts) {
    const est = await estimateContext(ctx);
    if (!est) continue; // no config/signal for this market yet — correct to skip

    const spent = categorySpent.get(ctx.category) ?? 0n;
    const decision = sizePosition(ctx, est, bankroll, spent, DEFAULT_SIZING);

    console.log(
      `[${ctx.category}] ${ctx.question} | price=${ctx.impliedPrice.toFixed(3)} est=${est.probability.toFixed(3)} (${est.rationale}) -> ${decision.reason}`
    );

    if (!decision.shouldTrade) continue;

    // "sell" means the agent's estimate is *below* the market price on this
    // outcome. We never hold an existing position to unwind here (this loop
    // only opens positions), so a bearish view is expressed by buying the
    // complementary outcome instead — well-defined only for binary markets.
    let targetOutcomeIdx = ctx.outcomeIdx;
    if (decision.side === "sell") {
      if (ctx.outcomeCount !== 2) {
        console.log(`  skip: bearish view on a ${ctx.outcomeCount}-outcome market has no single complementary outcome to buy instead`);
        continue;
      }
      targetOutcomeIdx = ctx.outcomeIdx === 0 ? 1 : 0;
    }

    const executed = await executeBuy(client, ctx.marketAddress, targetOutcomeIdx, decision.stake);
    if (executed) {
      categorySpent.set(ctx.category, spent + decision.stake);
      await saveCategorySpent(categorySpent); // save after every trade, not just at exit — crash-safe
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
