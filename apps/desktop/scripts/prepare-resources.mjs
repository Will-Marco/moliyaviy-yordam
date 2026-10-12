// Stages everything the packaged app needs under apps/desktop/.resources/{api,web,migrations}.
// The API is deployed with its production node_modules (pnpm --prod --legacy) and then pruned to what it
// can load at runtime (see runtime-packages.mjs) — the Rust-free Prisma runtime needs no CLI or engines.
import { execSync } from 'node:child_process'
import { cpSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runtimeEntries } from './runtime-packages.mjs'

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(desktop, '../..')
const out = join(desktop, '.resources')
const run = (cmd, cwd = repo) => execSync(cmd, { cwd, stdio: 'inherit' })

rmSync(out, { recursive: true, force: true })
run('pnpm --filter api build')
run('pnpm --filter web build')
try {
  run(`pnpm --filter api --prod deploy --legacy "${join(out, 'api')}"`)
} finally {
  // `pnpm deploy --prod` records a production-only install for the whole workspace; without this every later
  // `pnpm run` in the repo tries `pnpm install --production` and fails. Restore the dev install state.
  run('pnpm install --frozen-lockfile --prefer-offline')
}

// Keep only what the API can load at runtime: follow its dependencies through the deployed node_modules,
// skipping the Prisma CLI (build-time; @prisma/client lists it as a peer) and everything only it pulls in.
const apiDir = join(out, 'api')
const pnpmDir = join(apiDir, 'node_modules/.pnpm')
const keep = runtimeEntries(apiDir)
for (const entry of readdirSync(pnpmDir)) {
  if (entry === 'node_modules' || entry === 'lock.yaml' || entry.startsWith('.')) continue
  if (!keep.has(entry)) rmSync(join(pnpmDir, entry), { recursive: true, force: true })
}
// Prisma ships a query compiler per database; the generated client loads only the PostgreSQL one.
for (const entry of readdirSync(pnpmDir).filter((e) => e.startsWith('@prisma+client@'))) {
  const runtime = join(pnpmDir, entry, 'node_modules/@prisma/client/runtime')
  for (const file of readdirSync(runtime)) {
    const otherDb = /^query_compiler_.*\.(cockroachdb|mysql|sqlite|sqlserver)\./.test(file)
    if (otherDb || file.endsWith('.map')) rmSync(join(runtime, file), { force: true })
  }
}

// Trim the deployed API of test/source clutter (dist is what runs).
for (const junk of ['test', 'src', 'vitest.config.ts', 'vitest.config.e2e.ts', 'vitest.config.e2e.pglite.ts']) {
  rmSync(join(out, 'api', junk), { recursive: true, force: true })
}

cpSync(join(repo, 'apps/web/dist'), join(out, 'web'), { recursive: true })
cpSync(join(repo, 'apps/api/prisma/migrations'), join(out, 'migrations'), { recursive: true })
console.log('Resources staged under', out)
