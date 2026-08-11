/**
 * GDELT enforces "one request every 5 seconds" — shared across every caller
 * in this process (politics.ts and announcement.ts both hit it), so this
 * serializes calls through a single chain rather than throttling per-file.
 *
 * GDELT doesn't always signal overload with HTTP 429 — it sometimes returns
 * 200 OK with a plain-text rate-limit message as the body instead of JSON.
 * Checking only res.status missed that case entirely (a real, confirmed bug:
 * GTA VI failed every pass for 25+ minutes because of it). This retries on
 * *any* non-JSON response, not just 429s.
 */
const MIN_GAP_MS = 6_000;
const MAX_RETRIES = 4;
let chain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function gdeltFetchJson(url: string): Promise<any> {
  const run = chain.then(async () => {
    let lastError: Error = new Error("GDELT request failed after retries");
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let text: string;
      try {
        const res = await fetch(url);
        text = await res.text();
      } catch (err) {
        lastError = err as Error;
        await sleep(MIN_GAP_MS * (attempt + 1));
        continue;
      }
      try {
        const json = JSON.parse(text);
        await sleep(MIN_GAP_MS);
        return json;
      } catch {
        lastError = new Error(`GDELT non-JSON response: ${text.slice(0, 150)}`);
        await sleep(MIN_GAP_MS * (attempt + 1));
      }
    }
    throw lastError;
  });
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
