import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const connectionString =
  process.env.DATABASE_URL ?? process.env.PROD_DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL (or PROD_DATABASE_URL) is not set');
}

const pool = new Pool({ connectionString });
export const db = drizzle(pool, { schema });
