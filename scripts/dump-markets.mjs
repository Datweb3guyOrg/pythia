import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({ network: "competition-testnet" });

const { markets } = await client.listMarkets({
  status: "open",
  limit: 50,
});

for (const m of markets ?? []) {
  console.log("=".repeat(60));
  console.log(`[${m.category}] ${m.id}`);
  console.log(m.metadata?.question);
  console.log("outcomes:", m.metadata?.outcomes);
  console.log("resolvesAt:", m.resolvesAt, "settlesAt:", m.settlesAt);
  console.log("dataSources:", JSON.stringify(m.dataSources));
}
