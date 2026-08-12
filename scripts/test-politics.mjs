import "dotenv/config";
import { politicsEstimator } from "../src/estimators/politics.ts";
import { POLITICS_MARKETS } from "../src/config/markets.ts";

for (const cfg of POLITICS_MARKETS) {
  const ctx = { marketAddress: cfg.marketAddress, outcomeIdx: cfg.outcomeIdx, outcomeCount: 2, question: "", category: "politics", impliedPrice: 0.5 };
  const est = await politicsEstimator.estimate(ctx);
  console.log(cfg.gdeltQuery, "->", JSON.stringify(est));
}
