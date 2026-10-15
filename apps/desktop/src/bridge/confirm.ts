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

/** `firms`: 'all', the firm names when they could be read, or just how many were asked for. */
export function draftsPrompt(month: string, firms: 'all' | string[] | number): ConfirmRequest {
  const which =
    firms === 'all' ? 'Firmalar: barcha beruvchi firmalar.' : typeof firms === 'number' ? `${firms} ta firma.` : `Firmalar: ${firms.join(', ')}.`
  return {
    message: `Didox'da ${monthName(month)} uchun qoralamalar yaratish boshlansinmi?`,
    detail: `${which}\n\nIlova har bir firma nomidan ERI kaliti bilan Didox'ga kiradi va qoralamalarni saqlaydi. Hech narsa imzolanmaydi va yuborilmaydi.\n\n${HANDS_OFF}`,
  }
}

/** `firmName`: the organisation on the firm's E-IMZO key, when E-IMZO could be read; never text from the page. */
export function checkLoginPrompt(tin: string, firmName: string | null): ConfirmRequest {
  const firm = firmName ? `${firmName} (STIR ${tin})` : `STIR ${tin}`
  return {
    message: "Didox'ga kirishni tekshirish boshlansinmi?",
    detail: `Firma: ${firm}.\n\nIlova shu firmaning ERI kaliti bilan Didox'ga kiradi va darhol chiqadi. Hech narsa imzolanmaydi va yuborilmaydi.\n\n${HANDS_OFF}`,
  }
}

/** Runs `start` only after a yes; anything else — a no, a closed window, a failed dialog — starts nothing. */
export async function confirmed<R>(confirm: Confirm, request: ConfirmRequest, start: () => Promise<R>): Promise<R | typeof CANCELLED> {
  const yes = await confirm(request).catch(() => false)
  return yes ? start() : CANCELLED
}
