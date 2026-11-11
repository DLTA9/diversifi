import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import memoryQueue from '@opennextjs/cloudflare/overrides/queue/memory-queue';

// Without an incremental cache every request re-renders the page (and re-reads the chain).
// R2 stores the rendered pages, the regional cache keeps hot copies at the edge, and cache
// interception serves them before the Next.js server even loads. ISR refreshes run in the
// background via the memory queue (needs the WORKER_SELF_REFERENCE binding in wrangler.jsonc).
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),
  queue: memoryQueue,
  enableCacheInterception: true,
});
