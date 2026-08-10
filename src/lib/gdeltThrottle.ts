/**
 * GDELT enforces "one request every 5 seconds" — shared across every caller
 * in this process (politics.ts and announcement.ts both hit it), so this
 * serializes calls through a single chain rather than throttling per-file.
 * Retries with backoff on 429 since the limit appears to be enforced
 * somewhat conservatively (external traffic to the same IP counts too).
 */
const MIN_GAP_MS = 6_000;
const MAX_RETRIES = 4;
let chain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function gdeltFetch(url: string): Promise<Response> {
  const run = chain.then(async () => {
    let lastRes: Response | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url);
      if (res.status !== 429) {
        lastRes = res;
        break;
      }
      lastRes = res;
      await sleep(MIN_GAP_MS * (attempt + 1)); // widen the gap each retry
    }
    await sleep(MIN_GAP_MS);
    return lastRes!;
  });
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
