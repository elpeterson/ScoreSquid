// Runs queued Between Ends searches until none is left, then ends. Nothing schedules
// this: a parent starting a search does. It takes no arguments and passes only public
// tournament ids between steps, so no name or number reaches Vercel's run records.

import { createBeClient } from '../lib/betweenends/client';
import { runBatch, type BatchResult, type CrawlState } from '../lib/betweenends/crawl';
import { connectCrawlStore } from '../lib/betweenends/crawl-store';

const MIN_INTERVAL_MS = 1100;

async function crawlBatch(state: CrawlState): Promise<BatchResult> {
  'use step';
  const url = process.env.BE_CRAWLER_DATABASE_URL;
  if (!url) throw new Error('BE_CRAWLER_DATABASE_URL is not set');
  const { store, close } = connectCrawlStore(url);
  try {
    const client = createBeClient({ minIntervalMs: MIN_INTERVAL_MS });
    return await runBatch({ store, client, log: console.log }, state);
  } catch (err) {
    // Vercel keeps step errors, and a database error can quote a row with an archer's name.
    throw new Error(`Crawler database error ${(err as { code?: string }).code ?? 'unknown'}`);
  } finally {
    await close();
    // The next step gets a new client, with no memory of this one's last request.
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS));
  }
}

export async function beSearchWorkflow() {
  'use workflow';
  let state: CrawlState = null;
  for (;;) {
    const result: BatchResult = await crawlBatch(state);
    if (result.idle) return;
    state = result.state;
  }
}
