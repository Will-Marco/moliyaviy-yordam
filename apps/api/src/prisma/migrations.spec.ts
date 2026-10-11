import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { runMigrations } from './migrations.js';

function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mig-'));
  for (const [name, sql] of Object.entries(files)) {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'migration.sql'), sql);
  }
  return dir;
}

describe('runMigrations', () => {
  it('applies pending migrations in order and records them', async () => {
    const dir = fixtureDir({
      '20260101_a': 'CREATE TABLE a (id INT PRIMARY KEY);',
      '20260102_b': 'ALTER TABLE a ADD COLUMN n INT NOT NULL DEFAULT 0;',
    });
    const pg = new PGlite();
    expect(await runMigrations(pg, dir)).toEqual(['20260101_a', '20260102_b']);
    // second run is a no-op
    expect(await runMigrations(pg, dir)).toEqual([]);
    const { rows } = await pg.query<{ name: string }>('SELECT name FROM _app_migrations ORDER BY name');
    expect(rows.map((r) => r.name)).toEqual(['20260101_a', '20260102_b']);
    await pg.exec('INSERT INTO a (id, n) VALUES (1, 5)'); // schema really applied
    rmSync(dir, { recursive: true });
  });

  it('rolls back a failing migration and leaves the ledger clean', async () => {
    const dir = fixtureDir({ '20260101_bad': 'CREATE TABLE t (id INT); INVALID SQL HERE;' });
    const pg = new PGlite();
    await expect(runMigrations(pg, dir)).rejects.toThrow();
    const { rows } = await pg.query('SELECT name FROM _app_migrations');
    expect(rows).toEqual([]);
    // the table from the first statement must not survive the rollback
    await expect(pg.query('SELECT * FROM t')).rejects.toThrow();
    rmSync(dir, { recursive: true });
  });

  it('refuses to run against a database that has unknown (newer) migrations', async () => {
    const dir = fixtureDir({ '20260101_a': 'CREATE TABLE a (id INT);' });
    const pg = new PGlite();
    await runMigrations(pg, dir);
    await pg.exec("INSERT INTO _app_migrations (name) VALUES ('20260305_from_newer_app')");
    await expect(runMigrations(pg, dir)).rejects.toThrow(/yangiroq|newer|unknown/i);
    rmSync(dir, { recursive: true });
  });

  it('calls onBeforeApply once with the pending list, only when something is pending', async () => {
    const dir = fixtureDir({ '20260101_a': 'CREATE TABLE a (id INT);', '20260102_b': 'CREATE TABLE b (id INT);' });
    const pg = new PGlite();
    const calls: string[][] = [];
    await runMigrations(pg, dir, async (pending) => void calls.push(pending));
    expect(calls).toEqual([['20260101_a', '20260102_b']]);
    await runMigrations(pg, dir, async (pending) => void calls.push(pending)); // nothing pending
    expect(calls).toHaveLength(1);
    rmSync(dir, { recursive: true });
  });

  it('applies the real project migrations', async () => {
    const pg = new PGlite();
    const applied = await runMigrations(pg, new URL('../../prisma/migrations/', import.meta.url).pathname);
    expect(applied.length).toBeGreaterThanOrEqual(8);
    await pg.exec(
      "INSERT INTO companies (id, name, tin, created_at, updated_at) VALUES ('0192f000-0000-7000-8000-00000000000a','A','300000001',now(),now())",
    );
    const { rows } = await pg.query<{ count: bigint }>('SELECT count(*)::int AS count FROM companies');
    expect(Number(rows[0].count)).toBe(1);
  });
});
