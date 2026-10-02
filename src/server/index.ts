/**
 * Server entry — boots the Hono app from createServer() on $PORT
 * (default 4173, the port the vite dev proxy targets), and runs the anonymous
 * share retention sweep on a timer.
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import sharp from 'sharp';
import { createServer, sweepExpiredAnonShares } from './app.js';

// Railway bills reserved RAM, and sharp's defaults are tuned for throughput:
// one libvips thread per *host* core (containers see the whole machine) and an
// operation cache. Share-image renders are rare and their PNGs are already
// cached on disk, so neither buys anything here — they only pin memory.
// Pair with MALLOC_ARENA_MAX=2 on the service to curb glibc fragmentation.
sharp.concurrency(1);
sharp.cache(false);

const port = Number(process.env.PORT ?? 4173);

/**
 * Retention granularity. Hourly means a row can outlive its window by up to an
 * hour before deletion — fine for reclaiming space, and the cap in the mint
 * route is what actually bounds the worst case.
 */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function sweep(): void {
  sweepExpiredAnonShares().catch((err: unknown) => {
    // A failed sweep is not fatal: the next tick retries, and the row cap
    // still holds the line. Never take the server down over it.
    console.error('[server] anon share sweep failed:', err);
  });
}

sweep();
// Unref'd so a pending timer can't hold the process open on shutdown.
setInterval(sweep, SWEEP_INTERVAL_MS).unref();

serve({ fetch: createServer().fetch, port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
