/**
 * All Didox DOM knowledge (docs/research/didox-flow.md §1, §2b). Each locator is a JS expression evaluated in the page:
 * `el` locators resolve to an Element (for Page.click/type), probes return JSON (for Page.read/waitFor).
 * Values are embedded with JSON.stringify only. Nothing here names a sign/send button (FR-8.9).
 */

export interface Locator {
  js: string
  /** Uzbek name shown in errors ("… topilmadi"). */
  what: string
}

export const LOGIN_URL = 'https://didox.uz/login_with_signature?r=/documents/new&isInternal=true'
export const DOCUMENTS_URL_PREFIX = 'https://didox.uz/documents'

/** One key card in Didox's key menu. */
export interface CertItem {
  inn: string
  /** `DD.MM.YYYY` from "до DD.MM.YYYY", or null when unreadable. */
  expire: string | null
}

const KEY_PICKER_TEXT = 'Калитингизни танланг'
const ENTER_TEXT = 'Кириш'
const LOGOUT_TEXTS = ['Чиқиш', 'Выход', 'Chiqish']

/** Deepest element under `selector` whose trimmed text equals the JS expression `textJs`. */
const byExactTextJs = (selector: string, textJs: string) =>
  `(() => { const t = ${textJs}; const norm = (n) => (n.textContent || '').trim(); ` +
  `for (const el of document.querySelectorAll(${JSON.stringify(selector)})) { ` +
  `if (norm(el) === t && !Array.from(el.children).some((c) => norm(c) === t)) return el } return null })()`
const byExactText = (selector: string, text: string) => byExactTextJs(selector, JSON.stringify(text))

/** Probe form of an element locator: true once it exists. */
export const exists = (loc: Locator): Locator => ({ js: `!!(${loc.js})`, what: loc.what })

/** The key select's placeholder; clicking it opens `.certs-select__menu`. */
export const keyPicker: Locator = { js: byExactText('body *', KEY_PICKER_TEXT), what: '"Калитингизни танланг" (kalit tanlash)' }

export const keyMenuOpen: Locator = { js: `!!document.querySelector('.certs-select__menu')`, what: 'kalitlar menyusi' }

/** Every key card in the open menu as CertItem[]. */
export const keyMenuItems: Locator = {
  js:
    `Array.from(document.querySelectorAll('.certs-select__menu .certs-select__item')).map((it) => { ` +
    `const inn = ((it.querySelector('.certs-select__inn') || {}).textContent || '').replace(/\\D/g, ''); ` +
    `const m = ((it.querySelector('.certs-select__expire') || {}).textContent || '').match(/(\\d{2}\\.\\d{2}\\.\\d{4})/); ` +
    `return { inn, expire: m ? m[1] : null } })`,
  what: 'kalitlar ro\'yxati',
}

/**
 * The key card for `tin`; with `expire` (`DD.MM.YYYY`) also matches its "до …" date. Resolves to null unless exactly one
 * card matches, so a click never lands on a guess.
 */
export function keyMenuItem(tin: string, expire: string | null): Locator {
  return {
    js:
      `(() => { const tin = ${JSON.stringify(tin)}; const exp = ${JSON.stringify(expire)}; ` +
      `const hit = Array.from(document.querySelectorAll('.certs-select__menu .certs-select__item')).filter((it) => ` +
      `((it.querySelector('.certs-select__inn') || {}).textContent || '').replace(/\\D/g, '') === tin && ` +
      `(exp === null || ((it.querySelector('.certs-select__expire') || {}).textContent || '').includes(exp))); ` +
      `return hit.length === 1 ? hit[0] : null })()`,
    what: `STIR ${tin} kaliti`,
  }
}

/** STIR shown in the select once the menu has closed on a pick (digits only), or null. */
export const selectedKeyInn: Locator = {
  js:
    `(() => { if (document.querySelector('.certs-select__menu')) return null; ` +
    `const els = Array.from(document.querySelectorAll('.certs-select__inn')); ` +
    `return els.length === 1 ? (els[0].textContent || '').replace(/\\D/g, '') || null : null })()`,
  what: 'tanlangan kalit STIR\'i',
}

export const enterButton: Locator = { js: byExactText('button', ENTER_TEXT), what: '"Кириш" tugmasi' }

/** Drops focus from the page so no keystroke can land in a Didox field (B3). */
export const blurActive: Locator = {
  js: `(() => { const a = document.activeElement; if (a && typeof a.blur === 'function') a.blur(); return true })()`,
  what: 'fokusni olib tashlash',
}

export const atDocuments: Locator = {
  js: `location.href.startsWith(${JSON.stringify(DOCUMENTS_URL_PREFIX)})`,
  what: 'Didox hujjatlar sahifasi',
}

/** Visible toast / alert texts joined, or null. Didox reports login errors this way. */
export const toastText: Locator = {
  js:
    `(() => { const t = Array.from(document.querySelectorAll('.Toastify__toast, [role="alert"]'))` +
    `.map((e) => (e.textContent || '').trim()).filter(Boolean); return t.length ? t.join(' | ') : null })()`,
  what: 'Didox xabari',
}

/** Logged-in firm's STIR from the header switcher ("303 471 702"), raw text. */
export const headerFirmInn: Locator = {
  js: `(() => { const e = document.querySelector('.company-inn > div'); return e ? (e.textContent || '').trim() || null : null })()`,
  what: 'sarlavhadagi firma STIR\'i',
}

/** Didox's own sign-out entry (best-effort; not mapped yet). */
export const logoutEntry: Locator = {
  js:
    `(() => { const a = document.querySelector('a[href*="logout"]'); if (a) return a; ` +
    `for (const label of ${JSON.stringify(LOGOUT_TEXTS)}) { const e = ${byExactTextJs('a, button, li, [role="menuitem"]', 'label')}; if (e) return e } return null })()`,
  what: 'Didox\'dan chiqish',
}

export const leftDocuments: Locator = {
  js: `!location.href.startsWith(${JSON.stringify(DOCUMENTS_URL_PREFIX)})`,
  what: 'Didox\'dan chiqildi',
}
