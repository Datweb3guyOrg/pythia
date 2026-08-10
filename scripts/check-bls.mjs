import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
  signerType: "private_key",
  privateKey: process.env.WALLET_PRIVATE_KEY,
});

const CPI = "0x9e51ae58500a3ad19017af2eb4d846359b1c7ae7";
const EGGS = "0x1db6058367342c4f604d1a0e01566ff2f6481b9d";

for (const [label, addr] of [["CPI", CPI], ["EGGS", EGGS]]) {
  const m = await client.getMarket({ id: addr, pricesAndImpliedProbabilities: true });
  console.log(`\n=== ${label} ===`);
  console.log("status:", m.status);
  console.log("prices:", m.spotImpliedProbabilities);
  console.log("winningOutcomeIdx:", m.winningOutcomeIdx);

  const subgraph = client.getSubgraph();
  const data = await subgraph.query(`{
    gatewayBuys(first: 5, orderBy: timestamp_, orderDirection: desc, where: { marketProxy: "${addr}" }) {
      buyer tokensIn sharesOut outcomeIdx timestamp_
    }
  }`);
  console.log("recent buys:", JSON.stringify(data.gatewayBuys, null, 2));
}

// also check BLS directly for real July data
const bls = await fetch("https://api.bls.gov/publicAPI/v1/timeseries/data/APU0000708111?startyear=2026&endyear=2026").then(r => r.json());
console.log("\n=== BLS eggs latest data ===");
console.log(JSON.stringify(bls?.Results?.series?.[0]?.data?.slice(0, 3), null, 2));
