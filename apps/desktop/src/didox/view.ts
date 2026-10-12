import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BrowserWindow, session, type WebContents } from 'electron'
import { type Page, StepError } from './contract.js'
import { classifyRequest, isAllowedFrameNavigation, isAllowedNavigation } from './net-policy.js'
import {
  charDelay,
  type ClickProbe,
  clickScript,
  focusScript,
  pointerClick,
  pollScript,
  readScript,
  screenshotName,
  staleScreenshots,
} from './page-scripts.js'
import type { DidoxWindow } from './run.js'

/** In-memory partition (no `persist:`): nothing of Didox outlives the app run, and resetSession clears it between firms. */
const PARTITION = 'didox'
const POLL_MS = 250
const KEEP_SCREENSHOTS = 20
/** Our scripts run in their own JS world: same DOM, but Didox's globals cannot see or patch them (and vice versa). */
const ISOLATED_WORLD = 1001
const EVAL_TIMEOUT_MS = 10_000
const LOAD_TIMEOUT_MS = 45_000

let sessionGuarded = false

/** Session-wide rules, set once: deny every permission, allow only Didox + local E-IMZO, block sign/send endpoints. */
function guardSession(): Electron.Session {
  const ses = session.fromPartition(PARTITION)
  if (sessionGuarded) return ses
  sessionGuarded = true
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  ses.setPermissionCheckHandler(() => false)
  ses.webRequest.onBeforeRequest((details, callback) => {
    const verdict = classifyRequest(details.url)
    if (verdict !== 'allow') {
      // Host only: paths/queries may carry document ids.
      let host = '?'
      try {
        host = new URL(details.url).host
      } catch {}
      console.warn(`[didox] blocked ${verdict === 'blocked_action' ? 'sign/send request' : 'request'} to ${host}`)
    }
    callback({ cancel: verdict !== 'allow' })
  })
  return ses
}

/**
 * The visible Didox window (plan "Didox oynasi", v2 M7). No preload, sandboxed; the person watches but cannot click or
 * type into it while the app works (`setEnabled(false)`; sendInputEvent still reaches the page).
 */
export function openDidoxWindow({ diagnosticsDir, signal }: { diagnosticsDir: string; signal?: AbortSignal }): DidoxWindow {
  const ses = guardSession()
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: 'Didox — Moliyaviy yordam',
    webPreferences: { session: ses, contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  })
  win.setEnabled(false)
  const wc = win.webContents
  const keepOnDidox = (event: { preventDefault(): void }, url: string) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  }
  wc.on('will-navigate', keepOnDidox)
  wc.on('will-redirect', keepOnDidox)
  wc.on('will-frame-navigate', (event) => {
    if (!event.isMainFrame && !isAllowedFrameNavigation(event.url)) event.preventDefault()
  })
  // Didox's own new tabs are not needed for login/drafts; nothing opens outside this window.
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  // A half-filled form must not block navigation or closing.
  wc.on('will-prevent-unload', (event) => event.preventDefault())

  return {
    page: createPage(wc, { diagnosticsDir, signal }),
    async resetSession() {
      await ses.clearStorageData()
      await ses.clearCache()
    },
    close() {
      if (!win.isDestroyed()) win.destroy()
    },
  }
}

function createPage(wc: WebContents, { diagnosticsDir, signal }: { diagnosticsDir: string; signal?: AbortSignal }): Page {
  const cancelled = () => new StepError('CANCELLED', 'Bekor qilindi')
  // A crashed/killed renderer ends every pending wait at once instead of leaving it to its timeout.
  let gone: StepError | null = null
  const onGone = new Set<(e: StepError) => void>()
  wc.on('render-process-gone', (_event, details) => {
    gone = new StepError('PAGE_UNEXPECTED', `Didox sahifasi ishdan chiqdi (${details.reason})`)
    for (const notify of onGone) notify(gone)
  })

  const alive = () => {
    if (signal?.aborted) throw cancelled()
    if (gone) throw gone
    if (wc.isDestroyed()) throw new StepError('PAGE_UNEXPECTED', 'Didox oynasi yopildi')
  }

  /** `task` bounded by a timeout, the run's cancel signal and the renderer's death; never hangs. */
  const guard = <T>(task: Promise<T>, ms: number, onTimeout: () => StepError): Promise<T> =>
    new Promise<T>((ok, fail) => {
      const done = () => {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        onGone.delete(fail)
      }
      const timer = setTimeout(() => (done(), fail(onTimeout())), ms)
      const abort = () => (done(), fail(cancelled()))
      signal?.addEventListener('abort', abort, { once: true })
      onGone.add(fail)
      task.then(
        (v) => (done(), ok(v)),
        (e: unknown) => (done(), fail(e)),
      )
    })

  const sleep = (ms: number) =>
    new Promise<void>((ok, fail) => {
      if (signal?.aborted) return fail(cancelled())
      const done = () => {
        signal?.removeEventListener('abort', abort)
        ok()
      }
      const timer = setTimeout(done, ms)
      const abort = () => {
        clearTimeout(timer)
        fail(cancelled())
      }
      signal?.addEventListener('abort', abort, { once: true })
    })

  const evaluate = async <T>(script: string): Promise<T> => {
    alive()
    const task = wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: script }], false) as Promise<T>
    return guard(task, EVAL_TIMEOUT_MS, () => new StepError('PAGE_UNEXPECTED', 'Didox sahifasi javob bermayapti'))
  }

  const forbidden = (what: string, label: string) =>
    new StepError('FORBIDDEN_ACTION', `"${what}" imzolash/yuborish tugmasiga o'xshaydi (${label.slice(0, 60)}) — ilova uni bosmaydi`, what)

  return {
    async goto(url) {
      alive()
      if (!isAllowedNavigation(url)) throw new StepError('PAGE_UNEXPECTED', 'Ilova faqat Didox sahifalarini ochadi')
      try {
        await guard(wc.loadURL(url), LOAD_TIMEOUT_MS, () => {
          if (!wc.isDestroyed()) wc.stop()
          return new StepError('TIMEOUT', `Didox sahifasi ${LOAD_TIMEOUT_MS / 1000} s ichida ochilmadi`)
        })
      } catch (error) {
        if (error instanceof StepError) throw error
        // SPA redirects abort the first load (ERR_ABORTED, -3); the page is still there.
        if ((error as { errno?: number }).errno !== -3) throw new StepError('PAGE_UNEXPECTED', 'Didox sahifasi ochilmadi')
      }
    },

    url: () => (wc.isDestroyed() ? '' : wc.getURL()),

    async read<T>(snippet: string) {
      try {
        return await evaluate<T>(readScript(snippet))
      } catch (error) {
        if (error instanceof StepError) throw error
        throw new StepError('PAGE_UNEXPECTED', "Didox sahifasidan ma'lumot o'qib bo'lmadi")
      }
    },

    async waitFor<T>(snippet: string, { timeoutMs, what }: { timeoutMs: number; what: string }) {
      const deadline = Date.now() + timeoutMs
      const script = pollScript(snippet)
      for (;;) {
        const value = await evaluate<T>(script).catch((error: unknown) => {
          if (error instanceof StepError && error.code !== 'PAGE_UNEXPECTED') throw error
          if (gone || signal?.aborted || wc.isDestroyed()) throw error
          return null // page navigating between polls, or a slow evaluation
        })
        if (value) return value
        if (Date.now() >= deadline) throw new StepError('TIMEOUT', `${what} ${Math.round(timeoutMs / 1000)} s ichida chiqmadi`, what)
        await sleep(POLL_MS)
      }
    },

    async click(snippet, { what, needsPointer = false }) {
      if (!needsPointer) {
        const probe = await evaluate<ClickProbe>(clickScript(snippet, false))
        if (!probe.found) throw new StepError('PAGE_UNEXPECTED', `${what} topilmadi`, what)
        if (probe.forbidden) throw forbidden(what, probe.label)
        return
      }
      // A real mouse press for widgets (MUI menus) that ignore element.click().
      const { outcome, label } = await pointerClick({
        probe: () => evaluate<ClickProbe>(clickScript(snippet, true)),
        press: (x, y) => {
          alive()
          wc.sendInputEvent({ type: 'mouseMove', x, y })
          wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
        },
        release: (x, y) => {
          alive()
          wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
        },
        sleep,
      })
      if (outcome === 'clicked') return
      if (outcome === 'forbidden') throw forbidden(what, label)
      const why = {
        not_found: 'topilmadi',
        covered: 'boshqa element bilan yopilgan',
        unstable: "joyida turmadi (sahifa harakatlanmoqda)",
        moved: "bosish paytida joyi o'zgardi",
      }[outcome]
      throw new StepError('PAGE_UNEXPECTED', `${what} ${why}`, what)
    },

    async type(snippet, text, { what }) {
      const focused = await evaluate<boolean>(focusScript(snippet))
      if (!focused) throw new StepError('PAGE_UNEXPECTED', `${what} maydoniga kursor qo'yib bo'lmadi`, what)
      for (const ch of text) {
        alive()
        wc.sendInputEvent({ type: 'char', keyCode: ch })
        await sleep(charDelay())
      }
    },

    pause: (ms) => sleep(ms),

    async screenshot(label) {
      try {
        if (wc.isDestroyed() || gone) return null
        const png = (await guard(wc.capturePage(), EVAL_TIMEOUT_MS, () => new StepError('TIMEOUT', 'screenshot'))).toPNG()
        await mkdir(diagnosticsDir, { recursive: true })
        const file = join(diagnosticsDir, screenshotName(label, new Date()))
        await writeFile(file, png, { mode: 0o600 })
        for (const old of staleScreenshots(await readdir(diagnosticsDir), KEEP_SCREENSHOTS)) {
          await rm(join(diagnosticsDir, old), { force: true })
        }
        return file
      } catch {
        return null // diagnostics never fail a run
      }
    },
  }
}
