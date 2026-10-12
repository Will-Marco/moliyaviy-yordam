// Which `.pnpm` store entries the packaged API can actually load, following the deployed node_modules the
// way Node resolves them (pnpm layout: a package's deps are siblings in its `.pnpm/<entry>/node_modules`).
// The Prisma CLI is skipped: @prisma/client lists it as a peer, but it is build-time only (generate, migrate).
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'

const BUILD_ONLY = new Set(['prisma'])

/** Returns the set of `.pnpm/<entry>` names reachable from the app's runtime dependencies. */
export function runtimeEntries(appDir) {
  const store = join(appDir, 'node_modules/.pnpm')
  const entries = new Set()
  const seen = new Set()

  const visit = (fromDir, name) => {
    if (BUILD_ONLY.has(name)) return
    const link = join(fromDir, name)
    if (!existsSync(link)) return // optional dependency not installed for this platform
    const real = realpathSync(link)
    if (seen.has(real)) return
    seen.add(real)
    const rel = relative(store, real)
    if (!rel.startsWith('..')) entries.add(rel.split(sep)[0])
    const pkg = JSON.parse(readFileSync(join(real, 'package.json'), 'utf8'))
    // Siblings of this package in its store entry (scoped names live one level deeper).
    const siblings = rel.startsWith('..') ? join(appDir, 'node_modules') : dirname(name.startsWith('@') ? dirname(real) : real)
    for (const dep of [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
    ]) {
      visit(siblings, dep)
    }
  }

  const app = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'))
  for (const name of Object.keys(app.dependencies ?? {})) visit(join(appDir, 'node_modules'), name)
  return entries
}
