import { type AutotypeResult, type LoginContext, type Page, REJECTING_CODES, StepError, type StepErrorCode } from '../contract.js'
import { humanPauseMs, step } from '../driver.js'
import * as L from '../locators.js'

export interface LoginOptions {
  /** Source for human-pause jitter (0..1); tests pass a constant. */
  random?: () => number
  /** How long "Кириш" waits for the typist to be watching; tests shorten it. */
  readyWaitMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000
const DIALOG_TIMEOUT_MS = 20_000
const LOGIN_TIMEOUT_MS = 45_000
/*
 * "Кириш" is clicked once the typist says it is watching, never on a fixed lead: E-IMZO's window opens at once, and
 * a typist that starts looking after it treats it as someone else's and stops. A fixed 300 ms was enough for
 * osascript; powershell.exe needed a second or more on the Windows gate, and every login stopped "already open".
 * Past this wait the click goes ahead anyway — the typist's own "already open" check still keeps the password safe.
 */
const READY_WAIT_MS = 15_000

/**
 * Signs one firm in to Didox with its E-IMZO key (plan M8 "Login qadamlari" 3–7). The password is typed by the armed
 * typist into E-IMZO's own window exactly once; nothing is retried.
 */
export async function login(page: Page, ctx: LoginContext, opts: LoginOptions = {}): Promise<void> {
  const pause = () => page.pause(humanPauseMs(opts.random))
  const run = <T>(name: string, fn: () => Promise<T>) => step(name, page, ctx, fn)

  await run('openLogin', async () => {
    await page.goto(L.LOGIN_URL)
    await waitFor(page, L.exists(L.keyPicker), DEFAULT_TIMEOUT_MS)
  })

  await run('pickKey', async () => {
    await pause()
    await page.click(L.keyPicker.js, { what: L.keyPicker.what, needsPointer: true })
    await waitFor(page, L.keyMenuOpen, DEFAULT_TIMEOUT_MS)
    const items = await page.read<L.CertItem[]>(L.keyMenuItems.js)
    const expire = chooseExpire(Array.isArray(items) ? items : [], ctx.tin, ctx.keyValidTo)
    const item = L.keyMenuItem(ctx.tin, expire)
    await pause()
    await page.click(item.js, { what: item.what, needsPointer: true })
    const picked = await waitFor<string>(page, L.selectedKeyInn, DEFAULT_TIMEOUT_MS)
    if (picked !== ctx.tin) {
      throw new StepError('PAGE_UNEXPECTED', `Didox boshqa kalitni tanladi (STIR ${picked}, kutilgan ${ctx.tin})`)
    }
  })

  await run('armAndEnter', async () => {
    await page.read(L.blurActive.js)
    let markReady: () => void = () => undefined
    const ready = new Promise<void>((ok) => {
      markReady = ok
    })
    const typing = ctx.armAutotype({ dialogTimeoutMs: DIALOG_TIMEOUT_MS, signal: ctx.signal, onReady: () => markReady() })
    typing.catch(() => {}) // awaited below; keeps an early click failure from leaving an unhandled rejection
    // A typist that ended before watching (a window already open, no saved password) has its verdict: no click.
    if ((await firstOf(ready, typing, opts.readyWaitMs ?? READY_WAIT_MS)) === 'ended') {
      const failure = autotypeFailure(await typing)
      if (failure) throw failure
    }
    try {
      await page.click(L.enterButton.js, { what: L.enterButton.what })
    } catch (e) {
      // Let the typist finish before the firm is abandoned. If it already typed and was rejected/interrupted, that
      // outcome wins over the click error (even a cancel): a person must look before the app types again.
      const failure = autotypeFailure(await typing.catch(() => null))
      if (failure && REJECTING_CODES.has(failure.code)) throw failure
      throw e
    }
    // The typist's verdict is thrown as is, even if the run was cancelled meanwhile (step() keeps StepError codes).
    const failure = autotypeFailure(await typing)
    if (failure) throw failure
  })

  await run('awaitLogin', async () => {
    try {
      await waitFor(page, L.atDocuments, LOGIN_TIMEOUT_MS)
    } catch (e) {
      if (e instanceof StepError && e.code === 'CANCELLED') throw e
      if (ctx.signal.aborted) throw new StepError('CANCELLED', 'Bekor qilindi')
      const toast = await page.read<string | null>(L.toastText.js).catch(() => null)
      const base = `Didox'ga ${LOGIN_TIMEOUT_MS / 1000} soniyada kirilmadi`
      const cause = e instanceof StepError ? `${e.code}: ${e.message}` : e instanceof Error ? e.message : String(e)
      throw new StepError('LOGIN_FAILED', `${base} (sabab — ${cause})${toast ? `. Didox: ${toast}` : ''}`)
    }
  })

  await run('verifyFirm', async () => {
    const raw = await waitFor<string>(page, L.headerFirmInn, DEFAULT_TIMEOUT_MS)
    const shown = String(raw).replace(/\s/g, '')
    if (shown !== ctx.tin) {
      throw new StepError('WRONG_FIRM', `Didox boshqa firmaga kirdi (STIR ${shown}, kutilgan ${ctx.tin})`)
    }
  })
}

const AUTOTYPE_FAILURES: Record<AutotypeResult, { code: StepErrorCode; message: string } | null> = {
  typed: null,
  no_dialog: { code: 'EIMZO_DIALOG_MISSING', message: `E-IMZO parol oynasi ${DIALOG_TIMEOUT_MS / 1000} soniyada chiqmadi` },
  not_focused: { code: 'EIMZO_DIALOG_MISSING', message: 'E-IMZO oynasi fokusda emas — parol yozilmadi' },
  rejected: { code: 'WRONG_PASSWORD', message: 'E-IMZO parolni qabul qilmadi — parolni qayta kiriting' },
  layout: { code: 'KEYBOARD_LAYOUT', message: "Klaviaturani ABC/US ga o'tkazing" },
  interrupted: {
    code: 'AUTOTYPE_INTERRUPTED',
    message: "Parol yozish to'xtab qoldi — E-IMZO oynasini tekshiring, parolni qayta kiriting",
  },
  dialog_already_open: { code: 'EIMZO_DIALOG_OPEN', message: "E-IMZO'da ochiq oyna bor — uni yoping va qayta urining" },
  no_permission: {
    code: 'ACCESSIBILITY_DENIED',
    message: "Ilovaga Accessibility ruxsati berilmagan (Tizim sozlamalari → Maxfiylik → Accessibility) — parol yozilmadi",
  },
}

/** Which comes first: the typist watching, the typist ending, or the wait running out. */
function firstOf(ready: Promise<void>, typing: Promise<unknown>, waitMs: number): Promise<'ready' | 'ended' | 'timeout'> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timeout'>((ok) => {
    timer = setTimeout(() => ok('timeout'), waitMs)
  })
  // Subscribed first, so a typist that was ready and has already ended still counts as ready.
  const watching = ready.then(() => 'ready' as const)
  const ended = typing.then(
    () => 'ended' as const,
    () => 'ended' as const,
  )
  return Promise.race([watching, ended, timeout]).finally(() => clearTimeout(timer))
}

function autotypeFailure(result: AutotypeResult | null): StepError | null {
  const f = result ? AUTOTYPE_FAILURES[result] : null
  return f ? new StepError(f.code, f.message) : null
}

/**
 * Which "до DD.MM.YYYY" to pin the click to: null when the firm has exactly one card, the selected key's date when it
 * has several. Throws KEY_NOT_IN_DIDOX_LIST when no card fits.
 */
export function chooseExpire(items: L.CertItem[], tin: string, keyValidTo: string | null): string | null {
  const own = items.filter((i) => i.inn === tin)
  if (own.length === 0) throw notInList(tin)
  if (own.length === 1) return null
  const wanted = keyValidTo ? toDisplayDate(keyValidTo) : null
  if (!wanted) throw notInList(tin, "bir nechta kalit bor, qaysi biri tanlanganini aniqlab bo'lmadi")
  const same = own.filter((i) => i.expire === wanted)
  if (same.length !== 1) throw notInList(tin, `${wanted} gacha amal qiladigan kalit aniq topilmadi`)
  return wanted
}

const notInList = (tin: string, detail?: string) =>
  new StepError('KEY_NOT_IN_DIDOX_LIST', `STIR ${tin} kaliti Didox ro'yxatida yo'q${detail ? ` (${detail})` : ''}`)

/** `yyyy-mm-ddTHH:mm:ss` -> `DD.MM.YYYY`, or null. */
const toDisplayDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null
}

function waitFor<T = unknown>(page: Page, loc: L.Locator, timeoutMs: number): Promise<T> {
  return page.waitFor<T>(loc.js, { timeoutMs, what: loc.what })
}
