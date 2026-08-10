import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { Market } from "@gensyn-ai/gensyn-delphi-sdk";
import { sendTelegramAlert } from "./notify.js";

const STATE_PATH = "state/known-markets.json";

/**
 * Diffs the current open-market list against what we've seen before and
 * alerts on anything new — the curated list has been static at 11 markets
 * since trading opened, but nothing guarantees it stays that way for the
 * rest of the competition window.
 */
export async function checkForNewMarkets(markets: Market[]): Promise<void> {
  let known: string[] = [];
  try {
    known = JSON.parse(await readFile(STATE_PATH, "utf-8"));
  } catch {
    // first run — baseline silently, nothing to alert on yet
    await mkdir(dirname(STATE_PATH), { recursive: true });
    await writeFile(STATE_PATH, JSON.stringify(markets.map((m) => m.id)));
    return;
  }

  const knownSet = new Set(known.map((k) => k.toLowerCase()));
  const newOnes = markets.filter((m) => !knownSet.has(m.id.toLowerCase()));

  if (newOnes.length > 0) {
    const lines = newOnes.map((m) => `[${m.category}] ${m.metadata?.question ?? m.id}`);
    await sendTelegramAlert(`New Delphi competition market(s):\n${lines.join("\n")}`);
    console.log(`ALERT: ${newOnes.length} new market(s) detected: ${lines.join(" | ")}`);
  }

  await writeFile(STATE_PATH, JSON.stringify(markets.map((m) => m.id)));
}
