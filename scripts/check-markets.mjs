import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({ network: "competition-testnet" });

const { markets } = await client.listMarkets({ status: "open", limit: 50 });
console.log("Open markets:", markets ? markets.length : 0);
if (markets) {
  for (const m of markets) {
    console.log(`- [${m.category}] ${m.metadata?.question ?? "(no question)"} (${m.id})`);
  }
}
