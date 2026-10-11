import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The slice of PGlite the runner needs — keeps it testable without the full type. */
export interface MigrationDb {
  exec(sql: string): Promise<unknown>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  transaction<T>(callback: (tx: { exec(sql: string): Promise<unknown>; query(sql: string, params?: unknown[]): Promise<unknown> }) => Promise<T>): Promise<T | undefined>;
}

const LEDGER = '_app_migrations';

/**
 * Applies the Prisma migration SQL files the app ships to a local PGlite database (M9a).
 * Each migration and its ledger row run in one transaction, so a failure leaves nothing half-applied.
 * Refuses to run if the database already has a migration this build does not ship (a newer app wrote it).
 * Returns the migrations applied this run.
 */
export async function runMigrations(
  db: MigrationDb,
  migrationsDir: string,
  onBeforeApply?: (pending: string[]) => Promise<void>,
): Promise<string[]> {
  await db.exec(`CREATE TABLE IF NOT EXISTS "${LEDGER}" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const applied = new Set((await db.query<{ name: string }>(`SELECT name FROM "${LEDGER}"`)).rows.map((r) => r.name));

  const shipped = readdirSync(migrationsDir)
    .filter((name) => existsSync(join(migrationsDir, name, 'migration.sql')))
    .sort();
  const shippedSet = new Set(shipped);

  const unknown = [...applied].filter((name) => !shippedSet.has(name));
  if (unknown.length) {
    throw new Error(
      `Bazada bu ilova bilmaydigan migratsiya(lar) bor (ilova eskiroq / baza yangiroq): ${unknown.join(', ')}. Ilovani yangilang.`,
    );
  }

  const pending = shipped.filter((name) => !applied.has(name));
  if (pending.length && onBeforeApply) await onBeforeApply(pending);
  for (const name of pending) {
    const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8');
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`INSERT INTO "${LEDGER}" (name) VALUES ($1)`, [name]);
    });
  }
  return pending;
}
