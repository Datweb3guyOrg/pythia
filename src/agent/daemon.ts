import { runTradingPass } from "./run.js";

const INTERVAL_MS = 5 * 60 * 1000; // tightened further for faster reaction; safe since sleep only starts after a pass finishes (no overlap), and trades still gate on edge/confidence thresholds

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop(): Promise<void> {
  for (;;) {
    try {
      await runTradingPass(false);
    } catch (err) {
      // one bad pass (RPC hiccup, upstream outage) shouldn't kill a
      // process meant to run unattended for 13 days
      console.error("trading pass failed:", err);
    }
    console.log(`sleeping ${INTERVAL_MS / 60_000} minutes...`);
    await sleep(INTERVAL_MS);
  }
}

loop();
