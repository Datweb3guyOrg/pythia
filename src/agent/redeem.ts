import type { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

/**
 * Without this, winning positions just sit as unredeemed shares forever —
 * liquid TST only ever decreases as new trades spend it, never recovers as
 * markets settle in our favor. Run at the start of every pass, before
 * reading bankroll, so freshly-redeemed capital counts toward that pass's
 * sizing decisions.
 */
export async function redeemSettledPositions(client: DelphiClient): Promise<void> {
  const signer = await client.getSigner();
  const { positions } = await client.listPositions({
    wallet: signer.address,
    redeemedOrLiquidated: false,
  });
  if (!positions || positions.length === 0) return;

  const settledMarkets = [...new Set(positions.filter((p) => p.marketStatus === "settled").map((p) => p.marketProxy))];
  if (settledMarkets.length > 0) {
    try {
      const result = await client.redeemPositions({
        marketAddresses: settledMarkets as `0x${string}`[],
      });
      console.log(`redeemed ${settledMarkets.length} settled market(s): +${result.totalTokensOut} tokens`);
      for (const r of result.results) {
        if (!r.success) console.warn(`  redeem failed for ${r.marketAddress}: ${r.error}`);
      }
    } catch (err) {
      console.warn(`redeemPositions failed: ${(err as Error).message}`);
    }
  }

  // expired/failed markets have no winning outcome — exit via liquidate() instead
  const byMarket = new Map<string, number[]>();
  for (const p of positions) {
    if (p.marketStatus !== "expired" && p.marketStatus !== "failed") continue;
    const arr = byMarket.get(p.marketProxy) ?? [];
    arr.push(Number(p.outcomeIdx));
    byMarket.set(p.marketProxy, arr);
  }
  for (const [marketProxy, outcomeIndices] of byMarket) {
    try {
      const result = await client.liquidate({
        marketAddress: marketProxy as `0x${string}`,
        outcomeIndices,
      });
      console.log(`liquidated ${marketProxy}: +${result.totalTokensOut} tokens`);
    } catch (err) {
      console.warn(`liquidate failed for ${marketProxy}: ${(err as Error).message}`);
    }
  }
}
