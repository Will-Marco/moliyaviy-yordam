import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PGlite } from '@electric-sql/pglite';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.js';
import { snapshot } from './backup.js';
import { createDbRuntime } from './db.js';
import { runMigrations } from './migrations.js';

/** Where the shipped migration SQL lives (M9b packaging overrides this via PGLITE_MIGRATIONS_DIR). */
const migrationsDir = () =>
  process.env.PGLITE_MIGRATIONS_DIR ?? fileURLToPath(new URL('../../prisma/migrations/', import.meta.url));

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Set only for the local PGlite database; the server (pg) path applies migrations out of band. */
  private readonly pglite?: PGlite;
  /** Empty for an in-memory database (tests); set for a real on-disk one that is worth backing up. */
  private readonly dataDir: string;

  constructor(config: ConfigService<Env, true>) {
    const dataDir = config.get('PGLITE_DATA_DIR', { infer: true });
    const runtime = createDbRuntime({
      DB_DRIVER: config.get('DB_DRIVER', { infer: true }),
      DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
      PGLITE_DATA_DIR: dataDir,
    });
    super({ adapter: runtime.adapter });
    this.pglite = runtime.pglite;
    this.dataDir = dataDir;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pglite) return;
    await this.pglite.waitReady;
    const pglite = this.pglite;
    // CONSTITUTION §5: snapshot an on-disk database before changing its schema.
    const beforeApply = this.dataDir
      ? async () => void (await snapshot(pglite, join(dirname(this.dataDir), 'backups'), 'before-migrate'))
      : undefined;
    await runMigrations(pglite, migrationsDir(), beforeApply);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    // Flush the local file database to disk on a clean shutdown.
    if (this.pglite) await this.pglite.close();
  }
}
