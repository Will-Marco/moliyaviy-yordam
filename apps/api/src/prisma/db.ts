import { PGlite } from '@electric-sql/pglite';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import type { Env } from '../config/env.js';

type Adapter = ConstructorParameters<typeof import('../generated/prisma/client.js').PrismaClient>[0] extends { adapter?: infer A }
  ? NonNullable<A>
  : never;

export interface DbRuntime {
  adapter: Adapter;
  /** Present only for the local file database — the service runs migrations and backups against it (M9a). */
  pglite?: PGlite;
}

/** 'pg' → server PostgreSQL (dev/CI); 'pglite' → local file database bundled with the desktop app. */
export function createDbRuntime(env: Pick<Env, 'DB_DRIVER' | 'DATABASE_URL' | 'PGLITE_DATA_DIR'>): DbRuntime {
  if (env.DB_DRIVER === 'pglite') {
    const pglite = env.PGLITE_DATA_DIR ? new PGlite(env.PGLITE_DATA_DIR) : new PGlite();
    return { adapter: new PrismaPGlite(pglite) as unknown as Adapter, pglite };
  }
  return { adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) as unknown as Adapter };
}
