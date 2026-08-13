import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
  signerType: "private_key",
  privateKey: process.env.WALLET_PRIVATE_KEY,
});

const marketAddress = process.argv[2];
const outcomeIdx = Number(process.argv[3]);
const sharesIn = BigInt(process.argv[4]);

const quote = await client.quoteSell({ marketAddress, outcomeIdx, sharesIn });
console.log(`quote: ${sharesIn} shares for ${quote.tokensOut} tokens`);

const result = await client.sellShares({
  marketAddress,
  outcomeIdx,
  sharesIn,
  minTokensOut: (quote.tokensOut * 98n) / 100n,
});
console.log(`executed: ${result.transactionHash}`);
