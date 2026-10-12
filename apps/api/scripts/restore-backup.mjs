// Restores the local database from a backup made by BackupService (docs/runbooks/restore-backup.md).
// Usage (with the app CLOSED): node apps/api/scripts/restore-backup.mjs <backup.tgz> <app data folder>
// The current database is never deleted: it is moved aside to db-before-restore-<time> first.
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const [backupArg, userDataArg] = process.argv.slice(2)
if (!backupArg || !userDataArg) {
  console.error('Usage: node apps/api/scripts/restore-backup.mjs <backup.tgz> <app data folder>')
  process.exit(1)
}
const backup = resolve(backupArg)
const userData = resolve(userDataArg)
const db = join(userData, 'db')
if (!existsSync(backup)) throw new Error(`Backup not found: ${backup}`)
if (!existsSync(userData)) throw new Error(`App data folder not found: ${userData}`)

const aside = join(userData, `db-before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`)
const hadDb = existsSync(db)
if (hadDb) {
  renameSync(db, aside)
  console.log('Current database moved to', aside)
}

try {
  const restored = new PGlite(db, { loadDataDir: new Blob([readFileSync(backup)]) })
  const { rows } = await restored.query('SELECT count(*)::int AS n FROM companies')
  await restored.close()
  console.log(`Restored ${backup} into ${db} (${rows[0].n} companies). Start the app again.`)
} catch (error) {
  // Leave things exactly as they were: drop the half-restored folder, put the original database back.
  rmSync(db, { recursive: true, force: true })
  if (hadDb) renameSync(aside, db)
  console.error(`Restore failed, the original database is back in place: ${(error instanceof Error && error.message) || String(error)}`)
  process.exit(1)
}
