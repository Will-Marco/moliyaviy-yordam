// Stages everything the packaged app needs under apps/desktop/.resources/{api,web,migrations}.
// The API is deployed with its production node_modules (pnpm --prod --legacy) and then pruned of
// build-only Prisma tooling that the Rust-free runtime does not need.
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// Drop build-only Prisma tooling and the TS compiler — not needed at runtime (Prisma 7 is Rust-free).
const pnpmDir = join(out, 'api/node_modules/.pnpm')
const DROP = ['prisma@', '@prisma+engines@', '@prisma+studio-core@', '@prisma+dev@', 'typescript@', 'effect@']
if (existsSync(pnpmDir)) {
  for (const entry of readdirSync(pnpmDir)) {
    if (DROP.some((p) => entry.startsWith(p))) rmSync(join(pnpmDir, entry), { recursive: true, force: true })
  }
}
// Trim the deployed API of test/source clutter (dist is what runs).
for (const junk of ['test', 'src', 'vitest.config.ts', 'vitest.config.e2e.ts', 'vitest.config.e2e.pglite.ts']) {
  rmSync(join(out, 'api', junk), { recursive: true, force: true })
}

cpSync(join(repo, 'apps/web/dist'), join(out, 'web'), { recursive: true })
cpSync(join(repo, 'apps/api/prisma/migrations'), join(out, 'migrations'), { recursive: true })
console.log('Resources staged under', out)
