import "dotenv/config";
import { DelphiClient } from "@gensyn-ai/gensyn-delphi-sdk";

const client = new DelphiClient({
  network: "competition-testnet",
  apiKey: process.env.DELPHI_API_ACCESS_KEY,
});

const wallet = process.argv[2];
const { positions } = await client.listPositions({ wallet });
console.log(`Positions for ${wallet}:`, positions?.length ?? 0);

const { markets } = await client.listMarkets({ limit: 50 });
const byId = new Map((markets ?? []).map((m) => [m.id.toLowerCase(), m]));

for (const p of positions ?? []) {
  const m = byId.get(p.marketProxy.toLowerCase());
  const outcomeLabel = m?.metadata?.outcomes?.[Number(p.outcomeIdx)] ?? p.outcomeIdx;
  console.log(
    `- [${m?.category ?? "?"}] ${m?.metadata?.question ?? p.marketProxy} -> "${outcomeLabel}" | shares=${p.shares} | redeemed=${p.redeemedOrLiquidated} | status=${p.marketStatus}`
  );
}
