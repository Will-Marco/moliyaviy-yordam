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
export const CREATE_DOCUMENT_URL = 'https://didox.uz/create_document'
/** Didox returns here after a draft is saved (spike S4). */
export const DRAFT_LIST_URL_PREFIX = 'https://didox.uz/documents/new/draft'
/** How many rows one list page may hold; a full page means the list is not the whole picture (§4, step 0). */
export const DRAFT_LIST_LIMIT = 100
/** The counterparty's own drafts: Didox filters by STIR from the query (spike S4). */
export const draftListUrl = (borrowerTin: string): string =>
  `${DRAFT_LIST_URL_PREFIX}?tab=all&page=1&limit=${DRAFT_LIST_LIMIT}&partner=${encodeURIComponent(borrowerTin)}`
/** True once Didox has navigated to the draft list (step 11 waits for this). */
export const atDraftList: Locator = {
  js: `location.href.startsWith(${JSON.stringify(DRAFT_LIST_URL_PREFIX)})`,
  what: "qoralamalar ro'yxati sahifasi",
}

/** One key card in Didox's key menu. */
export interface CertItem {
  inn: string
  /** `DD.MM.YYYY` from "до DD.MM.YYYY", or null when unreadable. */
  expire: string | null
}

const ENTER_TEXT = 'Кириш'
const LOGOUT_TEXTS = ['Чиқиш', 'Выход', 'Chiqish']

/*
 * Deepest *matching* element whose trimmed text equals `textJs`: an element is skipped only when one of its
 * descendants that also matches `selector` carries the same text (a menu item inside a list item). Didox wraps its
 * button labels in a `<span>` (spike 2026-10-13), so comparing against every child instead would reject the button
 * for its own label and find nothing.
 */
const byExactTextJs = (selector: string, textJs: string) =>
  `(() => { const t = ${textJs}; const sel = ${JSON.stringify(selector)}; const norm = (n) => (n.textContent || '').trim(); ` +
  `for (const el of document.querySelectorAll(sel)) { ` +
  `if (norm(el) === t && !Array.from(el.querySelectorAll(sel)).some((c) => norm(c) === t)) return el } return null })()`
const byExactText = (selector: string, text: string) => byExactTextJs(selector, JSON.stringify(text))

/** Probe form of an element locator: true once it exists. */
export const exists = (loc: Locator): Locator => ({ js: `!!(${loc.js})`, what: loc.what })

/*
 * Didox redesigned its login page (spike 2026-10-13): the closed select is `.certs-trigger`, which shows the firm
 * name and STIR of the key it has preselected — the old "Калитингизни танланг" placeholder is gone. The menu it
 * opens kept its classes, so everything below still reads `.certs-select__*`.
 */
/** The closed key select; clicking it opens `.certs-select__menu`. */
export const keyPicker: Locator = { js: `document.querySelector('.certs-trigger')`, what: 'kalit tanlash ro\'yxati' }

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

/** STIR shown in the closed trigger once the menu has closed on a pick (digits only), or null. */
export const selectedKeyInn: Locator = {
  js:
    `(() => { if (document.querySelector('.certs-select__menu')) return null; ` +
    `const els = Array.from(document.querySelectorAll('.certs-trigger__inn')); ` +
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

/* ------------------------------------------------------------------------------------------------------------------
 * Hujjat formasi va qoralamalar ro'yxati (spike S2–S4, 2026-10-13 — didox-flow.md §2c).
 * Ustunlar **sarlavha matni** bo'yicha topiladi: МХИК tanlangach Didox "Имтиез" ustunini qo'shadi va indekslar siljiydi.
 * ------------------------------------------------------------------------------------------------------------------ */

/** "Товарни келиб чиқиши" ro'yxatidagi xizmat varianti (spike S3). SRS §9.1 dagi ruscha "Оказание услуг" — chop yorlig'i. */
export const ORIGIN_SERVICE_LABEL = 'Хизмат кўрсатиш'
/** МХИК kodi — foiz xizmati (SRS §9.1). */
export const INTEREST_MXIK = '10401999001000000'

/** Matnni solishtirishga tayyorlaydi: nol kenglikdagi belgilar va ortiqcha bo'shliqlar olib tashlanadi. */
const NORM_TEXT = `((n) => (n && n.textContent || '').replace(/[\\s\\u200b\\u00a0]+/g, ' ').trim())`

/**
 * Sarlavha maydoni: `div.input` ichida input va uning tagidagi `div.input__placeholder` yorlig'i turadi (yorliq
 * oldidagi `*` hisobga olinmaydi). Yorliq **bittadan ortiq** maydonga mos kelsa `null` — ikki "СТИР/ЖШШИР" maydonini
 * yorliq bo'yicha ajratib bo'lmaydi (ular uchun `sellerTinValue` / `counterpartyTin`).
 */
const formFieldJs = (label: string) =>
  `(() => { const norm = ${NORM_TEXT}; const want = ${JSON.stringify(label)}; ` +
  `const hit = Array.from(document.querySelectorAll('div.input')).filter((box) => { ` +
  `const ph = box.querySelector('.input__placeholder'); ` +
  `return ph && norm(ph).replace(/^\\*/, '').trim().indexOf(want) === 0 && box.querySelector('input') }); ` +
  `return hit.length === 1 ? hit[0].querySelector('input') : null })()`

export const formField = (label: string): Locator => ({ js: formFieldJs(label), what: `"${label}" maydoni` })

/** Maydon qiymati; maydon yo'q bo'lsa `null` (bo'sh maydon — `''`). */
export const formFieldValue = (label: string): Locator => ({
  js: `(() => { const el = ${formFieldJs(label)}; return el ? el.value : null })()`,
  what: `"${label}" qiymati`,
})

/** Sotuvchi va kontragent ustunlari `.form-title` sarlavhasi bilan ajratiladi. */
const partnerColJs = (titlePrefix: string) =>
  `(() => { const norm = ${NORM_TEXT}; ` +
  `const cols = Array.from(document.querySelectorAll('.body-inputs__partner-col')).filter((col) => { ` +
  `const t = col.querySelector('.form-title'); return t && norm(t).indexOf(${JSON.stringify(titlePrefix)}) === 0 }); ` +
  `return cols.length === 1 ? cols[0] : null })()`

const SELLER_TITLE = 'Сизнинг маълумотларингиз'
const COUNTERPARTY_TITLE = 'Контрагент маълумотлари'
/*
 * The counterparty's STIR and the counterparty's details sit in different columns (spike 2026-10-13): the STIR goes
 * under "Контрагент маълумотлари", and Didox fills the name, bank and director under "Ҳамкорингизнинг Корхонаси"
 * (the seller's own details are under "Ташкилот").
 */
const PARTNER_DETAILS_TITLE = 'Ҳамкорингизнинг Корхонаси'

/** Kirgan firma STIR'i — sotuvchi ustunidagi (o'zgartirib bo'lmaydigan) maydon. */
export const sellerTinValue: Locator = {
  js: `(() => { const col = ${partnerColJs(SELLER_TITLE)}; const el = col && col.querySelector('.inn input'); return el ? el.value : null })()`,
  what: "sotuvchi STIR'i",
}

export const counterpartyTin: Locator = {
  js: `(() => { const col = ${partnerColJs(COUNTERPARTY_TITLE)}; return col ? col.querySelector('.inn input') : null })()`,
  what: 'kontragent STIR maydoni',
}

/** Kontragent nomi — STIR yozilgach Didox o'zi to'ldiradi (nomlar ustuni STIR ustunidan boshqa). */
export const counterpartyNameValue: Locator = {
  js:
    `(() => { const norm = ${NORM_TEXT}; const col = ${partnerColJs(PARTNER_DETAILS_TITLE)}; if (!col) return null; ` +
    `const box = Array.from(col.querySelectorAll('div.input')).filter((b) => { const ph = b.querySelector('.input__placeholder'); ` +
    `return ph && norm(ph).replace(/^\\*/, '').trim().indexOf('Номи') === 0 })[0]; ` +
    `const el = box && box.querySelector('input'); return el ? el.value : null })()`,
  what: 'kontragent nomi',
}

/** Tovar jadvali — inputi bor yagona jadval. */
const GOODS_TABLE = `Array.from(document.querySelectorAll('table')).filter((t) => t.querySelector('tbody tr input'))[0]`
const GOODS_HEADINGS = `(() => { const norm = ${NORM_TEXT}; const t = ${GOODS_TABLE}; ` +
  `return t ? Array.from(t.querySelectorAll('thead th, thead td')).map(norm) : [] })()`
const goodsIndexJs = (heading: string) =>
  `(() => { const hs = ${GOODS_HEADINGS}; const want = ${JSON.stringify(heading)}.toLowerCase(); ` +
  `return hs.findIndex((h) => h.toLowerCase().indexOf(want) >= 0) })()`
const goodsCellJs = (heading: string) =>
  `(() => { const i = ${goodsIndexJs(heading)}; if (i < 0) return null; const t = ${GOODS_TABLE}; ` +
  `const row = t && t.querySelector('tbody tr'); return row && row.children[i] ? row.children[i] : null })()`

export const rowHeadings: Locator = { js: GOODS_HEADINGS, what: 'jadval sarlavhalari' }
export const rowColumnIndex = (heading: string): Locator => ({ js: goodsIndexJs(heading), what: `"${heading}" ustuni` })

export const rowField = (heading: string): Locator => ({
  js: `(() => { const cell = ${goodsCellJs(heading)}; return cell ? cell.querySelector('input') : null })()`,
  what: `"${heading}" katagi`,
})

export const rowValue = (heading: string): Locator => ({
  js: `(() => { const cell = ${goodsCellJs(heading)}; const el = cell && cell.querySelector('input'); return el ? el.value : null })()`,
  what: `"${heading}" qiymati`,
})

/**
 * MUI select'ni ochadigan element. Inputning o'zi `Mui-disabled` (qidiruv yo'q) — unga tekkan bosish e'tiborsiz
 * qoladi, shuning uchun ro'yxat `.MuiInputBase-root` bosilganda ochiladi (spike S3).
 */
export const rowSelectRoot = (heading: string): Locator => ({
  js: `(() => { const cell = ${goodsCellJs(heading)}; return cell ? cell.querySelector('.MuiInputBase-root') : null })()`,
  what: `"${heading}" ro'yxati`,
})

/** Shu katakdagi avtoto'ldirgichga bog'langan ro'yxat (sahifada bir nechtasi bor — `aria-controls` bo'yicha). */
const optionsListJs = (heading: string) =>
  `(() => { const cell = ${goodsCellJs(heading)}; const el = cell && cell.querySelector('input'); ` +
  `const id = el && el.getAttribute('aria-controls'); return id ? document.getElementById(id) : null })()`

export const rowOptions = (heading: string): Locator => ({
  js: `(() => { const norm = ${NORM_TEXT}; const list = ${optionsListJs(heading)}; ` +
    `return list ? Array.from(list.querySelectorAll('[role="option"]')).map(norm) : [] })()`,
  what: `"${heading}" variantlari`,
})

export const rowOption = (heading: string, text: string): Locator => ({
  js: `(() => { const norm = ${NORM_TEXT}; const list = ${optionsListJs(heading)}; if (!list) return null; ` +
    `const hit = Array.from(list.querySelectorAll('[role="option"]')).filter((o) => norm(o) === ${JSON.stringify(text)}); ` +
    `return hit.length === 1 ? hit[0] : null })()`,
  what: `"${text}" varianti`,
})

/** Kod bilan boshlanadigan yagona variant; bittadan ko'p mos kelsa `null` (noto'g'ri mahsulot tanlanmasin). */
export const rowOptionStartingWith = (heading: string, prefix: string): Locator => ({
  js: `(() => { const norm = ${NORM_TEXT}; const list = ${optionsListJs(heading)}; if (!list) return null; ` +
    `const hit = Array.from(list.querySelectorAll('[role="option"]')).filter((o) => norm(o).indexOf(${JSON.stringify(prefix)}) === 0); ` +
    `return hit.length === 1 ? hit[0] : null })()`,
  what: `"${prefix}" varianti`,
})

/** Ikki hujjat turi select'ining tanlangan matni: `["Ҳисоб-фактура актсиз", "Стандарт"]` kutiladi. */
export const docTypeValues: Locator = {
  js:
    `Array.from(document.querySelectorAll('select.doc-types__select')).map((s) => ` +
    `(s.options && s.options[s.selectedIndex] ? (s.options[s.selectedIndex].textContent || '').trim() : ''))`,
  what: 'hujjat turi',
}

/**
 * Shu yorliqdagi checkbox'lardan **birortasi** belgilanganmi. Yorliq takrorlanishi mumkin ("Акциз" ham hujjat, ham
 * qator darajasida bor — spike 2026-10-13), shuning uchun yagona moslik talab qilinmaydi: ilova tegmagan barcha
 * katakchalar bo'sh turishi kerak. Birortasi topilmasa `null` — forma kutilganidek emas.
 */
export const anyCheckboxTicked = (label: string): Locator => ({
  js:
    `(() => { const norm = ${NORM_TEXT}; const want = ${JSON.stringify(label)}; ` +
    `const hits = Array.from(document.querySelectorAll('.checkbox')).filter((b) => norm(b).indexOf(want) >= 0 && b.querySelector('input')); ` +
    `return hits.length ? hits.some((b) => !!b.querySelector('input').checked) : null })()`,
  what: `"${label}" belgisi`,
})

const SAVE_TEXT = 'Сақлаб қолиш'
const ATTENTION_CLOSE_TEXT = 'Ёпиш'

export const saveButton: Locator = { js: byExactText('button', SAVE_TEXT), what: `"${SAVE_TEXT}" tugmasi` }

/**
 * "Диққат!" ogohlantirish oynasining yopish tugmasi. Spike (2026-10-13): forma yuklangandan ~2 s keyin chiqadi va
 * **o'zi yopilmaydi**; tuzilishi `.blackout.main-alert > .alert-app`, tugma matni "Ёпиш". O'chirishni tasdiqlash
 * oynasi esa `.modal-container`/`.alert-modal` — ikkalasi ham qamrab olingan.
 */
export const attentionModalClose: Locator = {
  js: `(() => { const modal = document.querySelector('.alert-app, .main-alert, .modal-container, .alert-modal'); if (!modal) return null; ` +
    `const norm = ${NORM_TEXT}; const hit = Array.from(modal.querySelectorAll('button, .button')).filter((b) => norm(b) === ${JSON.stringify(ATTENTION_CLOSE_TEXT)}); ` +
    `return hit.length ? hit[0] : null })()`,
  what: 'ogohlantirish oynasini yopish',
}

/* ---- Qoralamalar ro'yxati (`/documents/new/draft`) ---- */

const LIST_TABLE = `Array.from(document.querySelectorAll('table')).filter((t) => t.querySelector('tbody tr a[href*="/documents/"]'))[0]`
const listCellJs = `(() => { const norm = ${NORM_TEXT}; const t = ${LIST_TABLE}; if (!t) return null; ` +
  `const hs = Array.from(t.querySelectorAll('thead th, thead td')).map(norm); ` +
  `const at = (want) => hs.findIndex((h) => h.toLowerCase().indexOf(want) >= 0); ` +
  `return { t: t, counterparty: at('контрагент'), contract: at('шартнома'), amount: at('ққссиз') } })()`

/**
 * Ro'yxat qatorlari `parse.ts` ning `RawListRow` shaklida: locator faqat xom matn beradi, ma'nosini `parseListRow`
 * hal qiladi. Ustunlar sarlavha bo'yicha (v2 da boshiga checkbox ustuni qo'shilgan).
 */
export const listRows: Locator = {
  js:
    `(() => { const norm = ${NORM_TEXT}; const ctx = ${listCellJs}; if (!ctx) return []; ` +
    `return Array.from(ctx.t.querySelectorAll('tbody tr')).map((tr) => { ` +
    `const a = tr.querySelector('a[href*="/documents/"]'); const st = tr.querySelector('.doc-status'); ` +
    `const cell = (i) => (i >= 0 && tr.children[i] ? norm(tr.children[i]) : ''); ` +
    `return { href: a ? a.getAttribute('href') : '', statusClass: st ? st.className : '', ` +
    `counterparty: cell(ctx.counterparty), contract: cell(ctx.contract), amount: cell(ctx.amount) } }) })()`,
  what: "qoralamalar ro'yxati",
}

export const listRowCount: Locator = {
  js: `(() => { const t = ${LIST_TABLE}; return t ? t.querySelectorAll('tbody tr').length : 0 })()`,
  what: 'qoralamalar soni',
}

/** Ro'yxat yuklanganini bildiradi: jadval qatori bor yoki "bo'sh" holati ko'rsatilgan. */
export const listReady: Locator = {
  js: `(() => { const norm = ${NORM_TEXT}; const t = ${LIST_TABLE}; if (t && t.querySelector('tbody tr')) return true; ` +
    `const body = document.querySelector('table tbody'); return !!(body && norm(body).length >= 0 && document.querySelector('table')) })()`,
  what: "qoralamalar ro'yxati",
}
