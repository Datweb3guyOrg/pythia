import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
  signerType: "private_key",
  privateKey: process.env.WALLET_PRIVATE_KEY,
});

const { markets } = await client.listMarkets({
  status: "open",
  limit: 50,
  pricesAndImpliedProbabilities: true,
});

const rows = (markets ?? []).map((m) => {
  const p = m.spotImpliedProbabilities?.[0] ?? null;
  const distFrom50 = p !== null ? Math.abs(p - 0.5) : null;
  return { category: m.category, question: m.metadata?.question, price0: p, distFrom50, id: m.id };
});

rows.sort((a, b) => (a.distFrom50 ?? 1) - (b.distFrom50 ?? 1));
for (const r of rows) {
  console.log(`${(r.distFrom50 ?? 0).toFixed(3)} dist | price[0]=${r.price0?.toFixed(3)} | [${r.category}] ${r.question}`);
}
