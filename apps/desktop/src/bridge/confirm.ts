/*
 * CONSTITUTION §13 (M13): the page now comes from a server on the internet, so a page may only *ask* for a Didox
 * login — the yes comes from this computer, in a native dialog the page cannot draw, click or answer. A server
 * that was broken into can then show a button, but cannot sign in to Didox with an accountant's ERI key.
 */

export interface ConfirmRequest {
  /** The question, one line. */
  message: string
  /** What exactly will happen, so the person knows what they are agreeing to. */
  detail: string
}

/** Shows the question; true only for an explicit "Boshlash". */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>

/** The refusal the page already understands (CheckLoginResult / StartDraftsResult with code CANCELLED). */
export const CANCELLED = { ok: false, code: 'CANCELLED', message: 'Bekor qilindi — ilova oynasida tasdiqlanmadi' } as const

const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr']

/** "2026-09" → "Sentabr 2026", as the web prints it (apps/web/src/lib/format.ts). */
const monthName = (month: string) => {
  const [year, index] = month.split('-')
  return `${MONTHS[Number(index) - 1] ?? month} ${year}`
}

const HANDS_OFF = "Jarayon davomida klaviatura va sichqonchaga tegmang: parol E-IMZO oynasiga shu kompyuterning klaviaturasi orqali yoziladi."

/** A firm named in a confirmation: its STIR (digits only) and the organisation on its local E-IMZO key, if any. */
export interface ConfirmFirm {
  tin: string
  name: string | null
}

const MAX_NAME = 60
const MAX_FIRMS_SHOWN = 10
/** Control and format characters (incl. bidi overrides) and line/paragraph separators: none belongs in a firm name. */
const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu

/**
 * One line, at most MAX_NAME characters: a certificate field is still outside text, and must not be able to add
 * lines to the dialog or push its real content out of view. Null when nothing printable is left.
 */
function cleanName(name: string | null): string | null {
  const flat = (name ?? '').replace(UNPRINTABLE, ' ').replace(/\s+/g, ' ').trim()
  if (!flat) return null
  const chars = [...flat]
  return chars.length > MAX_NAME ? `${chars.slice(0, MAX_NAME - 1).join('')}…` : flat
}

const firmLabel = (tin: string, name: string | null) => {
  const clean = cleanName(name)
  return clean ? `${clean} (STIR ${tin})` : `STIR ${tin}`
}

/**
 * `firms`: 'all', or the picked firms — STIRs with the organisation on their local E-IMZO key — or just how many were
 * asked for when their STIRs could not be read. Never a name the server or the page wrote (security review H1).
 */
export function draftsPrompt(month: string, firms: 'all' | ConfirmFirm[] | number): ConfirmRequest {
  const listed = (list: ConfirmFirm[]) => {
    const shown = list.slice(0, MAX_FIRMS_SHOWN).map((f) => firmLabel(f.tin, f.name))
    const rest = list.length - MAX_FIRMS_SHOWN
    return `Firmalar: ${[...shown, ...(rest > 0 ? [`+${rest} ta`] : [])].join(', ')}.`
  }
  const which = firms === 'all' ? 'Firmalar: barcha beruvchi firmalar.' : typeof firms === 'number' ? `${firms} ta firma.` : listed(firms)
  return {
    message: `Didox'da ${monthName(month)} uchun qoralamalar yaratish boshlansinmi?`,
    detail: `${which}\n\nIlova har bir firma nomidan ERI kaliti bilan Didox'ga kiradi va qoralamalarni saqlaydi. Hech narsa imzolanmaydi va yuborilmaydi.\n\n${HANDS_OFF}`,
  }
}

/**
 * `firmName`: the organisation on the firm's E-IMZO key as this computer reads it, or null — never text from the page
 * or the server. It is still cleaned and capped here, like every name a confirmation shows.
 */
export function checkLoginPrompt(tin: string, firmName: string | null): ConfirmRequest {
  const firm = firmLabel(tin, firmName)
  return {
    message: "Didox'ga kirishni tekshirish boshlansinmi?",
    detail: `Firma: ${firm}.\n\nIlova shu firmaning ERI kaliti bilan Didox'ga kiradi va darhol chiqadi. Hech narsa imzolanmaydi va yuborilmaydi.\n\n${HANDS_OFF}`,
  }
}

/**
 * A "Boshlash" that arrives sooner than this after the dialog was shown is not a decision: a page can call the bridge
 * between the two clicks of a double-click, so the second click lands on the dialog's default-looking button.
 */
const MIN_ANSWER_MS = 600

/**
 * Wraps the native dialog (security review M3b): only one confirmation is open at a time — a page asking again while
 * one is open gets an immediate no, so it cannot stack dialogs until one is clicked through — and a yes that came
 * faster than MIN_ANSWER_MS counts as a no.
 */
export function guardConfirm(show: Confirm, now: () => number = Date.now): Confirm {
  let open = false
  return async (request) => {
    if (open) return false
    open = true
    try {
      const shownAt = now()
      const yes = await show(request)
      return yes && now() - shownAt >= MIN_ANSWER_MS
    } finally {
      open = false
    }
  }
}

/** Runs `start` only after a yes; anything else — a no, a closed window, a failed dialog — starts nothing. */
export async function confirmed<R>(confirm: Confirm, request: ConfirmRequest, start: () => Promise<R>): Promise<R | typeof CANCELLED> {
  const yes = await confirm(request).catch(() => false)
  return yes ? start() : CANCELLED
}
