import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
});

const subgraph = client.getSubgraph();
const marketProxy = process.argv[2];
const data = await subgraph.query(`{
  gatewayBuys(first: 20, orderBy: timestamp_, orderDirection: desc, where: { marketProxy: "${marketProxy}" }) {
    buyer
    tokensIn
    sharesOut
    outcomeIdx
    timestamp_
  }
}`);

console.log(JSON.stringify(data, null, 2));
