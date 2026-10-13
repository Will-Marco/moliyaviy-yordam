/**
 * Seams of the Didox driver (M8b). Steps talk only to `Page`; the Electron implementation lives in view.ts,
 * tests use a fake. Nothing here imports electron.
 */

/** One browser tab the app drives like a person would. All waits honour the run's cancel signal. */
export interface Page {
  goto(url: string): Promise<void>
  url(): string
  /** Evaluates a locator snippet (an expression string from locators.ts) in the page and returns its JSON result. */
  read<T>(snippet: string): Promise<T>
  /** Polls `snippet` until it returns a truthy value; throws StepError('TIMEOUT') after `timeoutMs`. */
  waitFor<T>(snippet: string, opts: { timeoutMs: number; what: string }): Promise<T>
  /** Clicks the element `snippet` resolves to. Refuses sign/send buttons (ForbiddenAction). */
  click(snippet: string, opts: { what: string; needsPointer?: boolean }): Promise<void>
  /** Focuses the element and types like a keyboard, with human pauses between characters. */
  type(snippet: string, text: string, opts: { what: string }): Promise<void>
  /**
   * Empties a field the way a person would (select all, Backspace) and checks it is empty afterwards: typing into a
   * field that still holds Didox's own value would append, and the amount would be wrong (§9).
   */
  clear(snippet: string, opts: { what: string }): Promise<void>
  /** Reloads the current page (the draft list may need a second look before the new row appears). */
  reload(): Promise<void>
  /**
   * Opens a select (MUI menus ignore element.click()), picks the option and waits for the menu to close;
   * `optionSnippet` is checked against the sign/send guard like any click.
   */
  selectOption(openSnippet: string, optionSnippet: string, opts: { what: string }): Promise<void>
  /** Human-speed pause between actions. */
  pause(ms: number): Promise<void>
  /** Local diagnostics screenshot; returns its file path. */
  screenshot(label: string): Promise<string | null>
}

/** Buttons the app must never press (FR-8.9): sign / send. Page.click checks the element's text against it. */
export const FORBIDDEN_LABEL = /Имзолаш|Юбориш|Подписать|Отправить|Imzolash|Yuborish/i

/** Stable codes: the run journal and the UI key off them. Messages are Uzbek. */
export type StepErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'FORBIDDEN_ACTION'
  | 'EIMZO_NOT_RUNNING'
  | 'KEY_MISSING'
  | 'KEY_EXPIRED'
  | 'KEY_NOT_IN_DIDOX_LIST'
  | 'PASSWORD_MISSING'
  | 'PASSWORD_REJECTED'
  | 'EIMZO_DIALOG_MISSING'
  | 'WRONG_PASSWORD'
  | 'KEYBOARD_LAYOUT'
  | 'ACCESSIBILITY_DENIED'
  | 'AUTOTYPE_INTERRUPTED'
  | 'EIMZO_DIALOG_OPEN'
  | 'PLATFORM_UNSUPPORTED'
  | 'LOGIN_FAILED'
  | 'WRONG_FIRM'
  | 'PAGE_UNEXPECTED'
  // M8c (§8). Rule: a failure in steps 0-10 means Didox holds nothing; from step 11 on a draft may exist there,
  // and the message says so, because only a person may look.
  | 'FORM_UNEXPECTED_VALUE'
  | 'COUNTERPARTY_NOT_FILLED'
  | 'COUNTERPARTY_MISMATCH'
  | 'SIMILAR_DRAFT_EXISTS'
  | 'LIST_TRUNCATED'
  | 'SAVE_FAILED'
  | 'SAVED_ID_UNKNOWN'
  | 'SAVED_ID_AMBIGUOUS'

export class StepError extends Error {
  constructor(
    readonly code: StepErrorCode,
    message: string,
    readonly step?: string,
    readonly screenshot?: string | null,
  ) {
    super(message)
    this.name = 'StepError'
  }
}

/**
 * Result of typing the ERI password into E-IMZO's own window (autotype/).
 * typed — typed once and the dialog closed; no_dialog — no E-IMZO window in time; not_focused — the window or its
 * password field was not focused, nothing typed; rejected — typed once, the dialog stayed, Escape pressed once;
 * layout — keyboard layout is not Latin (macOS keystroke depends on it); no_permission — Accessibility not granted;
 * interrupted — typing started but was not confirmed (focus lost, script failed, killed): treated like a rejection,
 * a person must look before the app types again; dialog_already_open — an E-IMZO window existed before arming,
 * nothing typed (only a window that appears after arming is ever typed into).
 */
export type AutotypeResult =
  | 'typed'
  | 'no_dialog'
  | 'not_focused'
  | 'rejected'
  | 'layout'
  | 'no_permission'
  | 'interrupted'
  | 'dialog_already_open'

/**
 * Arms the typist before "Кириш" is clicked; resolves once it has finished. The password never leaves main.
 * Aborting `signal` before typing has started kills the typist (nothing typed); once typing started it runs to the end.
 */
export type ArmAutotype = (opts: { dialogTimeoutMs: number; signal: AbortSignal }) => Promise<AutotypeResult>

/** Checked before the Didox window opens or "Кириш" is pressed, so a doomed login never leaves a dialog behind. */
export type AutotypePreflightResult = 'ok' | 'layout' | 'no_permission' | 'unsupported' | 'dialog_already_open'
export type AutotypePreflight = () => Promise<AutotypePreflightResult>

/** Codes after which the saved password is marked rejected: it was (maybe) typed and the login did not go through. */
export const REJECTING_CODES: ReadonlySet<StepErrorCode> = new Set(['WRONG_PASSWORD', 'LOGIN_FAILED', 'AUTOTYPE_INTERRUPTED'])

export interface ProgressEvent {
  /** Absent for "Kirishni tekshirish" (M8b), which is not a journalled run. */
  runId?: string
  firmTin: string
  contractId?: string
  /** 1-based position of this invoice within the firm, for "3/7" in the live log. */
  invoiceIndex?: number
  invoiceCount?: number
  step: string
  status: 'running' | 'done' | 'failed'
  message?: string
}

/** What one firm's login needs; `armAutotype` already has that firm's password bound in. */
export interface LoginContext {
  tin: string
  /** validTo of the E-IMZO key picked for this firm (`yyyy-mm-ddTHH:mm:ss`), to choose among several keys. */
  keyValidTo: string | null
  armAutotype: ArmAutotype
  onProgress?: (e: ProgressEvent) => void
  signal: AbortSignal
}

/**
 * Codes a run reports outside a page step: the runner itself, the journal, the API and the app's lifecycle (§8).
 * Together with StepErrorCode this is every code `checkLogin`, `createDrafts` and the journal can produce, which is
 * what `didoxMessage` and the UI's hints are keyed on — a code missing here would show up as "unexpected".
 */
export type RunCode =
  | 'RUN_IN_PROGRESS'
  | 'UNEXPECTED'
  | 'EIMZO_ERROR'
  | 'KEY_UNKNOWN'
  | 'INTERRUPTED_SAVE'
  | 'AMOUNT_CHANGED'
  | 'ALREADY_DRAFTED'
  | 'POSSIBLE_DUPLICATE'
  | 'DRAFT_CHANGED'
  | 'API_REJECTED'
  | 'API_UNAVAILABLE'
  | 'STALLED'
  | 'APP_CLOSED'
  | 'SKIPPED_BY_USER'
  | 'NOTHING_TO_DO'

export type DidoxCode = StepErrorCode | RunCode

/**
 * One Uzbek sentence per code — what happened, and whether Didox may hold a draft. The journal stores its own
 * message where it has more to say (which field, which amount); this is the fallback and the UI's wording.
 */
export const DIDOX_MESSAGES: Record<DidoxCode, string> = {
  // Before the window opens
  EIMZO_NOT_RUNNING: "E-IMZO ishlamayapti — uni ishga tushirib qayta urining",
  KEY_MISSING: "Bu firma uchun E-IMZO kaliti topilmadi",
  KEY_EXPIRED: "Kalitning muddati o'tgan",
  KEY_NOT_IN_DIDOX_LIST: "Kalit Didox ro'yxatida chiqmadi",
  PASSWORD_MISSING: "ERI paroli kiritilmagan",
  PASSWORD_REJECTED: "ERI paroli rad etilgan — qayta kiriting",
  KEYBOARD_LAYOUT: "Klaviaturani ABC/US (lotin) tartibiga o'tkazing",
  ACCESSIBILITY_DENIED: "Ilovaga Accessibility ruxsatini bering: System Settings → Privacy & Security",
  PLATFORM_UNSUPPORTED: "Bu tizimda E-IMZO paroli hali avtomatik yozilmaydi",
  EIMZO_DIALOG_OPEN: "E-IMZO oynasi allaqachon ochiq — uni yoping va qayta urinib ko'ring",
  // Login
  EIMZO_DIALOG_MISSING: "E-IMZO parol oynasi chiqmadi",
  WRONG_PASSWORD: "E-IMZO parolini qabul qilmadi — parolni qayta kiriting",
  AUTOTYPE_INTERRUPTED: "Parol yozilayotganda uzildi — parolni qayta kiriting",
  LOGIN_FAILED: "Didox'ga kirib bo'lmadi",
  WRONG_FIRM: "Didox boshqa firma nomidan kirgan",
  /*
   * PAGE_UNEXPECTED can come from any step, step 12 included (a failed read while locating the saved draft), so it
   * never claims either way. The codes below it are raised only while the form is being filled (steps 0-10), where
   * Didox is known to hold nothing.
   */
  PAGE_UNEXPECTED: "Didox sahifasi kutilganidek emas",
  FORM_UNEXPECTED_VALUE: "Didox formasidagi qiymat kutilganidek emas — hech narsa saqlanmadi",
  COUNTERPARTY_NOT_FILLED: "Kontragent STIR bo'yicha to'lmadi — hech narsa saqlanmadi",
  COUNTERPARTY_MISMATCH: "Didox ko'rsatgan kontragent nomi ilovadagi firmaga mos emas — hech narsa saqlanmadi",
  SIMILAR_DRAFT_EXISTS: "Didox'da shunga o'xshash qoralama bor — tekshirib o'zingiz hal qiling",
  LIST_TRUNCATED: "Didox qoralama ro'yxati juda uzun — ishonchli o'qib bo'lmadi",
  TIMEOUT: "Didox kutilgan vaqtda javob bermadi",
  FORBIDDEN_ACTION: "Imzolash/yuborish tugmasi bosilmadi (ilova hech qachon imzolamaydi)",
  CANCELLED: "Bekor qilindi",
  // From the save on (step 11+): Didox may hold a draft
  SAVE_FAILED: "Saqlash tugamadi — Didox Қоралама'sini tekshiring",
  INTERRUPTED_SAVE: "Saqlash yarmida uzildi — Didox Қоралама'sini tekshiring",
  SAVED_ID_UNKNOWN: "Saqlandi, lekin qoralama ro'yxatda topilmadi — Didox Қоралама'sini tekshiring",
  SAVED_ID_AMBIGUOUS: "Ro'yxatda bir nechta mos qoralama bor — qaysi biri ekanini o'zingiz tanlang",
  // Marking it in the app
  AMOUNT_CHANGED: "Oy foizi o'zgargan — Didox'dagi qoralama eski summa bilan qolgan",
  ALREADY_DRAFTED: "Bu oy uchun qoralama allaqachon belgilangan",
  POSSIBLE_DUPLICATE: "Didox'da ikkita qoralama bo'lishi mumkin — tekshiring",
  DRAFT_CHANGED: "Faktura belgisi shu payt o'zgardi",
  API_REJECTED: "Ilova qoralamani yozib olmadi",
  API_UNAVAILABLE: "Ilovaning ichki serveri javob bermadi — keyingi ochilishda belgilanadi",
  // The runner itself
  RUN_IN_PROGRESS: "Didox bilan boshqa ish bajarilmoqda — tugashini kuting",
  UNEXPECTED: "Kutilmagan xato",
  EIMZO_ERROR: "E-IMZO bilan aloqa xatosi",
  KEY_UNKNOWN: "Kalitning amal qilish muddatini o'qib bo'lmadi",
  // The run itself
  STALLED: "Ish qotib qoldi — to'xtatildi",
  APP_CLOSED: "Ilova ish tugashidan oldin yopildi",
  SKIPPED_BY_USER: "Buxgalter bu fakturani shu oy uchun o'tkazib yubordi",
  NOTHING_TO_DO: "Bu oy uchun qoralama qilinadigan faktura yo'q",
}

/** Steps 11+ may have left a draft in Didox; the UI sends a person to look. */
export const MAY_HAVE_SAVED: ReadonlySet<DidoxCode> = new Set<DidoxCode>([
  'SAVE_FAILED',
  'INTERRUPTED_SAVE',
  'SAVED_ID_UNKNOWN',
  'SAVED_ID_AMBIGUOUS',
  'LIST_TRUNCATED',
  'AMOUNT_CHANGED',
  'POSSIBLE_DUPLICATE',
  'DRAFT_CHANGED',
  'API_REJECTED',
  'API_UNAVAILABLE',
])

export const didoxMessage = (code: string): string => DIDOX_MESSAGES[code as DidoxCode] ?? "Kutilmagan xato"
