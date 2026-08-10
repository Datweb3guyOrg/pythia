import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const STATE_PATH = "state/category-spent.json";

/**
 * categorySpent has to survive across runs once this is scheduled (each
 * GitHub Actions run is a fresh process) — otherwise the per-category
 * exposure cap in sizing.ts resets every run and stops meaning anything
 * over a 13-day competition. Plain JSON on disk; the workflow restores/saves
 * the `state/` directory via actions/cache between runs.
 */
export async function loadCategorySpent(): Promise<Map<string, bigint>> {
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    const obj: Record<string, string> = JSON.parse(raw);
    return new Map(Object.entries(obj).map(([k, v]) => [k, BigInt(v)]));
  } catch {
    return new Map(); // no state file yet — first run
  }
}

export async function saveCategorySpent(spent: Map<string, bigint>): Promise<void> {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const obj = Object.fromEntries([...spent.entries()].map(([k, v]) => [k, v.toString()]));
  await writeFile(STATE_PATH, JSON.stringify(obj, null, 2));
}
