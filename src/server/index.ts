/**
 * Server entry — boots the Hono app from createServer() on $PORT
 * (default 4173, the port the vite dev proxy targets).
 */
import 'dotenv/config';
import { serve } from '@hono/node-server';
import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 4173);

serve({ fetch: createServer().fetch, port }, (info) => {
  console.log(`[server] listening on http://localhost:${info.port}`);
});
