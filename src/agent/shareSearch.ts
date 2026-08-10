import type { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const MAX_ITERATIONS = 30;
const MAX_PROBE_ESCALATIONS = 6;

export interface ShareQuote {
  sharesOut: bigint;
  tokensIn: bigint;
}

/**
 * The gateway contract enforces a minimum tradeable share delta per call
 * (observed on-chain as SharesOutBelowMinDelta — 0.01 shares / 1e16 on at
 * least one market) and reverts quoteBuy below it. There's no getter for
 * this exposed on the client, so the probe escalates geometrically from a
 * conservative starting point until a call actually succeeds, and uses
 * that as the search floor instead of 0.
 */
async function findWorkingProbe(
  client: DelphiClient,
  marketAddress: `0x${string}`,
  outcomeIdx: number
): Promise<{ sharesOut: bigint; tokensIn: bigint } | null> {
  let probe = 10_000_000_000_000_000n; // 0.01 share — known floor from observed revert
  for (let i = 0; i < MAX_PROBE_ESCALATIONS; i++) {
    try {
      const quote = await client.quoteBuy({ marketAddress, outcomeIdx, sharesOut: probe });
      return { sharesOut: probe, tokensIn: quote.tokensIn };
    } catch {
      probe *= 10n;
    }
  }
  return null;
}

/**
 * buyShares/sellShares take an exact share count (18 decimals), but sizing
 * decides in token terms (6 decimals) — "spend up to N tokens." LMSR cost is
 * monotonically increasing in sharesOut, so binary search finds the largest
 * sharesOut whose quoted tokensIn does not exceed the budget. quoteBuy is a
 * read-only eth_call (no gas) per the SDK docs, so this is cheap to run
 * before every trade.
 */
export async function findSharesForTokenBudget(
  client: DelphiClient,
  marketAddress: `0x${string}`,
  outcomeIdx: number,
  tokenBudget: bigint
): Promise<ShareQuote> {
  if (tokenBudget <= 0n) return { sharesOut: 0n, tokensIn: 0n };

  const probe = await findWorkingProbe(client, marketAddress, outcomeIdx);
  if (probe === null) {
    return { sharesOut: 0n, tokensIn: 0n }; // market won't quote at any size we tried — skip
  }
  if (probe.tokensIn > tokenBudget) {
    return { sharesOut: 0n, tokensIn: 0n }; // even the minimum tradeable size exceeds budget
  }

  const pricePerShare = Number(probe.tokensIn) / Number(probe.sharesOut);
  const upperBound = BigInt(Math.ceil((Number(tokenBudget) / pricePerShare) * 3)); // 3x safety margin
  return binarySearch(client, marketAddress, outcomeIdx, tokenBudget, probe.sharesOut, upperBound);
}

async function binarySearch(
  client: DelphiClient,
  marketAddress: `0x${string}`,
  outcomeIdx: number,
  tokenBudget: bigint,
  lo: bigint,
  hi: bigint
): Promise<ShareQuote> {
  let bestShares = 0n;
  let bestTokensIn = 0n;

  for (let i = 0; i < MAX_ITERATIONS && lo <= hi; i++) {
    const mid = lo + (hi - lo) / 2n;
    if (mid === 0n) break;
    let quote;
    try {
      quote = await client.quoteBuy({ marketAddress, outcomeIdx, sharesOut: mid });
    } catch {
      // below the contract's minimum delta even though our floor probe
      // succeeded — treat like "too small," push the floor up
      lo = mid + 1n;
      continue;
    }
    if (quote.tokensIn <= tokenBudget) {
      bestShares = mid;
      bestTokensIn = quote.tokensIn;
      lo = mid + 1n;
    } else {
      hi = mid - 1n;
    }
  }

  return { sharesOut: bestShares, tokensIn: bestTokensIn };
}
