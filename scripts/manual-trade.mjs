import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";
import { findSharesForTokenBudget } from "../src/agent/shareSearch.ts";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
  signerType: "private_key",
  privateKey: process.env.WALLET_PRIVATE_KEY,
});

const marketAddress = process.argv[2];
const outcomeIdx = Number(process.argv[3]);
const tokenBudget = BigInt(process.argv[4]);

const { sharesOut, tokensIn } = await findSharesForTokenBudget(client, marketAddress, outcomeIdx, tokenBudget);
console.log(`quote: ${tokensIn} tokens for ${sharesOut} shares`);
if (sharesOut === 0n) { console.log("budget too small"); process.exit(1); }

await client.ensureTokenApproval({ marketAddress, minimumAmount: tokensIn });
const result = await client.buyShares({
  marketAddress,
  outcomeIdx,
  sharesOut,
  maxTokensIn: (tokensIn * 102n) / 100n,
});
console.log(`executed: ${result.transactionHash}`);
