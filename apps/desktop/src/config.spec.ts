import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { checkServer, configPath, installLabel, isConfigured, loadConfig, parseServerUrl, robotTokenPath, saveServer } from './config.js'

describe('parseServerUrl (M13 §4.2)', () => {
  it('takes an https address and keeps only its origin', () => {
    expect(parseServerUrl('https://moliya.example.uz')).toEqual({ ok: true, origin: 'https://moliya.example.uz' })
    expect(parseServerUrl('  https://moliya.example.uz/  ')).toEqual({ ok: true, origin: 'https://moliya.example.uz' })
    expect(parseServerUrl('https://localhost:8443')).toEqual({ ok: true, origin: 'https://localhost:8443' })
  })

  it('refuses plain http — the trust check and the Secure cookie rely on https', () => {
    expect(parseServerUrl('http://moliya.example.uz')).toMatchObject({ ok: false, message: expect.stringContaining('https://') })
  })

  it('refuses an address that is more than an origin', () => {
    for (const input of [
      'https://moliya.example.uz/app',
      'https://moliya.example.uz/?x=1',
      'https://moliya.example.uz/#top',
      'https://user:pw@moliya.example.uz',
    ]) {
      expect(parseServerUrl(input), input).toMatchObject({ ok: false })
    }
  })

  it('refuses what is not an address at all', () => {
    for (const input of ['', '   ', 'moliya.example.uz', 'ftp://moliya.example.uz', 'javascript:alert(1)']) {
      expect(parseServerUrl(input), input).toMatchObject({ ok: false })
    }
  })
})

describe('checkServer', () => {
  const answer = (status: number, body: string | null, type = 'application/json') =>
    async () => new Response(body, { status, headers: { 'content-type': type } })

  it('accepts the app\'s own "not logged in" answer and asks /api/auth/me for it', async () => {
    const seen: string[] = []
    const fetch = async (url: string | URL) => {
      seen.push(String(url))
      return answer(401, JSON.stringify({ statusCode: 401, message: 'Sessiya tugagan' }))()
    }
    expect(await checkServer('https://moliya.example.uz', fetch)).toEqual({ ok: true })
    expect(seen).toEqual(['https://moliya.example.uz/api/auth/me'])
  })

  it('accepts a 200 JSON answer (already logged in)', async () => {
    expect(await checkServer('https://a.uz', answer(200, JSON.stringify({ username: 'admin' })))).toEqual({ ok: true })
  })

  it('refuses a server that is not this app', async () => {
    expect(await checkServer('https://a.uz', answer(404, '<html>Not found</html>', 'text/html'))).toMatchObject({ ok: false })
    expect(await checkServer('https://a.uz', answer(401, 'Unauthorized', 'text/plain'))).toMatchObject({ ok: false })
    expect(await checkServer('https://a.uz', answer(200, '<html></html>', 'text/html'))).toMatchObject({ ok: false })
    expect(await checkServer('https://a.uz', answer(500, JSON.stringify({ message: 'x' })))).toMatchObject({ ok: false })
  })

  it('says so when the server cannot be reached', async () => {
    const fetch = async () => {
      throw new TypeError('fetch failed')
    }
    expect(await checkServer('https://a.uz', fetch)).toMatchObject({ ok: false, message: expect.stringContaining('ulanib') })
  })
})

describe('stored config', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'desktop-config-'))
  })

  const ids = { randomUUID: () => '3f9a1c2e-0000-4000-8000-000000000001', hostname: () => 'BUXGALTER-PC' }

  it('is not configured before the first run', () => {
    expect(loadConfig(dir)).toBeNull()
    expect(isConfigured(dir)).toBe(false)
  })

  it('saves the server with an install id made once', async () => {
    const saved = saveServer(dir, 'https://moliya.example.uz', ids)

    expect(saved).toEqual({ serverUrl: 'https://moliya.example.uz', installId: '3f9a1c2e-0000-4000-8000-000000000001', installName: 'BUXGALTER-PC' })
    expect(loadConfig(dir)).toEqual(saved)
    expect(isConfigured(dir)).toBe(true)
  })

  it('keeps the install identity when the server is saved again', () => {
    saveServer(dir, 'https://a.uz', ids)
    const again = saveServer(dir, 'https://b.uz', { randomUUID: () => 'other', hostname: () => 'RENAMED' })

    expect(again).toMatchObject({ serverUrl: 'https://b.uz', installId: ids.randomUUID(), installName: 'BUXGALTER-PC' })
  })

  it("drops the robot token when another server is saved — it is the old server's key (security review L5)", async () => {
    saveServer(dir, 'https://a.uz', ids)
    await writeFile(robotTokenPath(dir), '{}')

    saveServer(dir, 'https://a.uz', ids)
    expect(await readFile(robotTokenPath(dir), 'utf8')).toBe('{}')

    saveServer(dir, 'https://b.uz', ids)
    await expect(readFile(robotTokenPath(dir), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats a pre-M13 config (local login) as not configured, and replaces it', async () => {
    await writeFile(configPath(dir), JSON.stringify({ username: 'admin', passwordHash: '$argon2id$x', jwtSecret: 's' }))
    expect(isConfigured(dir)).toBe(false)

    saveServer(dir, 'https://a.uz', ids)

    expect(JSON.parse(await readFile(configPath(dir), 'utf8'))).not.toHaveProperty('passwordHash')
  })

  it('does not trust a stored address that is not https', async () => {
    await writeFile(configPath(dir), JSON.stringify({ serverUrl: 'http://a.uz', installId: 'x', installName: 'PC' }))
    expect(loadConfig(dir)).toBeNull()
  })

  it('names the install by computer name and the start of its id', () => {
    expect(installLabel({ serverUrl: 'https://a.uz', installId: '3f9a1c2e-0000', installName: 'BUXGALTER-PC' })).toBe('BUXGALTER-PC (3f9a1c2e)')
    // The server keeps at most 100 characters (apps/api didox-flag.dto.ts).
    expect(installLabel({ serverUrl: 'https://a.uz', installId: '3f9a1c2e', installName: 'X'.repeat(200) }).length).toBeLessThanOrEqual(100)
  })
})
