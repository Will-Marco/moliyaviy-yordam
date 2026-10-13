# M8c — Didox qoralama yaratish: yakuniy spetsifikatsiya (v5)

> **Holat:** v5 (Fable, 2026-10-13) — [M8c-REVIEW.md](M8c-REVIEW.md) (Sonnet, APPROVE_WITH_CHANGES) 4 blocker + 7 major'ni yopadi.
> **Sir gate → so'ng qurish** (Opus, c0 → c1 → c2, quyida). Spike S1–S7 c1 locator'laridan **oldin**.
>
> **Bu fayl M8c uchun yagona manba.** [M8-didox-drafts.md](M8-didox-drafts.md) dagi "Qoralama qadamlari", "Orkestratsiya",
> "IPC yuzasi", "API o'zgarishlari §2", "Xato semantikasi", "M8c TDD", "spike ro'yxati" bo'limlari **shu fayl bilan almashtirildi**
> (u yerda "→ v5" belgisi). Ziddiyat bo'lsa — v5 ustun.
>
> **Doira (Sir, 2026-10-12/13):** FR-8.4 forma roboti **Claude tomonidan quriladi** (v3 "Claude qurmaydi" bekor, v2 to'liq
> qaytarilgan). Ikki yangi qaror (2026-10-13): (1) faktura-darajali **"o'tkazib yuborish" belgisi**; (2) run paytida ilova
> **bloklanmaydi** — `expectedAmount` guard + banner.

## 0. Qurilgan narsa va o'zgarmaydiganlar

Qurilgan (M8a/M8b, o'zgarmaydi): `eimzo/*`, `secrets/eri-store.ts` (`withPassword(tin, fn, serial)`), `didox/autotype/*`,
`didox/net-policy.ts`, `didox/page-scripts.ts` (sign/send uch qavat), `didox/steps/login.ts` + `logout.ts`, `bridge/trust.ts`.
API: `invoice_drafts.source` (migratsiya `20261012100000`), `PUT /api/invoices/:month/:contractId/draft` (`MarkDraftDto`:
`source:'didox'` → `didoxDocumentId` 32-hex **va** `expectedAmount` majburiy; 409 `AMOUNT_CHANGED` / `CONFIRMATION_REQUIRED`
{`ALREADY_DRAFTED`|`POSSIBLE_DUPLICATE`} / `DRAFT_CHANGED`; 400 "foiz yo'q" / "oy tugamagan"). **API'ga yangi jadval yo'q.**

O'zgaradigan (M8c): `didox/contract.ts` (kengayadi), `didox/run.ts` (refaktor: `loginFirm` ajratiladi, heartbeat, kritik bo'lim),
`didox/view.ts` (`clear`, `reload`, `selectOption`, `backgroundThrottling`, `powerSaveBlocker`), `didox/locators.ts` (forma qismi),
`testing/fake-page.ts` (poll), `bridge/ipc.ts`, `main.ts` (API o'limi/quit), web `features/invoices/*`, `lib/desktop.ts`.
Yangi: `api/jwt.ts`, `api/client.ts`, `didox/money.ts`, `didox/parse.ts`, `didox/journal.ts`, `didox/skips.ts`,
`didox/steps/create-draft.ts`.

## 1. Ma'lumot oqimi va moliyaviy aniqlik (CONSTITUTION §7–11, review M2)

- Summa manbai — **faqat** `GET /api/invoices?month` → `rows[].amount` (`money(interest)`, `^\d+\.\d{2}$`). Desktop uni
  `tiyinOf(amount): bigint` bilan o'qiydi (qat'iy regex, boshqa format → `Error`). Shu satr **o'zgarmasdan** `expectedAmount` bo'lib
  API'ga qaytadi. Desktop'da summa hech qachon hisoblanmaydi.
- `didox/money.ts` (sof, testli):
  - `tiyinOf(apiAmount: string): bigint` — `^\d{1,16}\.\d{2}$` aks holda throw.
  - `parseDidoxMoney(text: string): bigint | null` — NBSP/oddiy bo'shliq ming ajratgichlari olib tashlanadi; `^\d+([.,]\d{1,2})?$`;
    **>2 kasr yoki boshqa belgi → `null`** (API `scaled()` kabi kesish **yo'q**). Testlar: `0.01`, `0.10`, `1`, `1.00`, `1,5`,
    `552328.77`, `552 328,77`, `15 904 000 000.10`, `552328.765`→null, `1e3`→null, `−1`→null.
  - `formatForDidox(tiyin: bigint, sep: '.' | ','): string` — BigInt'dan satr (`whole + sep + frac2`), `Number`/`toFixed` **yo'q**.
    `sep` — spike S2 natijasi (konstanta `DIDOX_DECIMAL_SEP`, sukut `.`).
  - Qo'riqchi test (`money.spec.ts`): `src/didox/**` va `src/api/**` ichida `Number(`, `parseFloat(`, `parseInt(` chaqiruvi yo'q
    (sana raqamlari uchun `Number` kerak bo'lsa — `didox/parse.ts` ichida `digits()` yordamchisi, test istisnosi aniq ro'yxatda).
- Forma tekshiruvi (8-qadam): `Нарҳ`, `етказиб бериш нарҳи`, `Жами` har biri `parseDidoxMoney` → `=== amountTiyin`; `ққс миқдор` → `0n`.
  Birortasi `null` yoki farq → `FORM_UNEXPECTED_VALUE` (firma-stop). Qoralama ro'yxati ustuni [7] ham shu parser bilan.

## 2. Journal — `userData/didox-runs/<runId>.json` (FR-8.7, review B1.3/B2)

Main — **yagona yozuvchi**; `temp + rename`, `mode 0600`, har holat o'zgarishi diskka **kutilib** yoziladi (write-ahead).
`pending-marks.json` **yo'q** — bitta ombor. `runId = <ISO vaqt, ':'→'-'>-<4 hex>` (nom bo'yicha saralanadi). 50 tadan eskisi o'chiriladi
(`needs_check`/`id_found` qolgan run o'chirilmaydi).

```ts
interface RunJournal {
  runId: string; month: string; trigger: 'manual'            // M8d: 'scheduled'
  startedAt: string; finishedAt?: string
  status: 'running' | 'done' | 'cancelled' | 'failed'; failure?: { code: string; message: string }
  firms: FirmEntry[]
}
interface FirmEntry {
  tin: string; name: string
  status: 'pending' | 'login' | 'running' | 'done' | 'skipped' | 'failed'
  code?: string; message?: string; screenshot?: string | null
  invoices: InvoiceEntry[]
}
interface InvoiceEntry {
  contractId: string; contractNumber: string; contractSignedOn: string   // yyyy-mm-dd
  borrowerTin: string; borrowerName: string; lineName: string
  amount: string                                                            // API satri, expectedAmount
  state: 'pending' | 'saving' | 'id_found' | 'marked' | 'needs_check' | 'skipped' | 'error'
  savingAt?: string          // "Сақлаб қолиш" bosilishidan OLDIN yoziladi
  didoxId?: string           // id_found / marked / needs_check (ma'lum bo'lsa)
  candidateIds?: string[]    // SIMILAR_DRAFT_EXISTS / SAVED_ID_AMBIGUOUS
  code?: string; message?: string; screenshot?: string | null
  steps?: { step: string; status: 'done' | 'failed'; at: string }[]        // jonli log uchun qisqa tarix
}
```

Holat mashinasi (bir faktura): `pending → saving → id_found → marked`; har bosqichdan `needs_check` / `error`; `pending → skipped`.
- **`saving`** — "Сақлаб қолиш" bosilishidan oldin yoziladi. Ilova shu holatda yiqilsa → keyingi ishga tushishda `needs_check`
  (`code: 'INTERRUPTED_SAVE'`), tiklash §5 bo'yicha.
- **`id_found`** — ID ro'yxatdan olingach, PUT'dan **oldin** yoziladi. ID yo'qolmaydi. PUT muvaffaqiyatsiz (tarmoq/5xx/API yo'q) →
  `id_found` qoladi; `flushIdFound()` (ilova ochilganda va har run boshida) qayta PUT qiladi.
- **`needs_check`** — buxgalter hal qiladi (§7 UI). Ilova **hech qachon** o'zi yaratmaydi/belgilamaydi; faqat §5 read-only tiklash.
- **`error`** — faktura-darajali yoki firma-stop sababli tugamagan (Didox'da hech narsa yo'q — 0–10 qadam).
- Ilova ochilganda `recoverStaleRuns()`: `status:'running'` run → `failed{code:'APP_CLOSED'}`; uning `saving` → `needs_check`,
  `id_found` → `flushIdFound()`, `pending` → `skipped{'ilova yopildi'}`.

**Skip belgisi** — `userData/didox-skips.json`: `{ "<month>/<contractId>": { at, note? } }` (Sir qarori 1). Run rejalashtirishda
skip'langan faktura `skipped{code:'SKIPPED_BY_USER'}`. UI'dan qo'yiladi/olinadi (§7). API'ga tegmaydi.

## 3. Orkestratsiya — `run.ts` (review B4, M1)

Refaktor: hozirgi `run(tin)` tanasi → `loginFirm(win, tin, key, serial)` (listKeys/withPassword/login/verifyFirm) va `checkLogin` uni
chaqiradi. `createDrafts` ham shu `loginFirm`ni ishlatadi. Bitta engine, bitta qulf (`current`), bitta heartbeat.

```ts
start(opts: { month: string; lenderIds: string[] | 'all'; trigger: 'manual' }): Promise<{ ok: true; runId: string } | { ok: false; code; message }>
cancel(): void            // kritik bo'limni hurmat qiladi (quyida)
busy(): boolean
inCritical(): boolean     // main.ts before-quit uchun
status(): RunJournal | null
```

`start` **bloklamaydi**: tekshiruvlar (RUN_IN_PROGRESS, oy formati `MONTH`, lenderIds uuid ≤200) → journal yaratiladi → `{runId}`
qaytadi → run fonda. Natija `didox:progress` + `didox:status`.

**Oqim:**
1. `flushIdFound()` (barcha run'lar).
2. `api.listInvoices(month)` → `draft === null` qatorlar → `lenderIds` filtri → skip filtri → beruvchi STIR bo'yicha guruh.
   Shu oyning `needs_check` (ID'siz, `savingAt` bor) yozuvlari ham firma bo'yicha yig'iladi (§5 tiklash uchun). Hech narsa yo'q →
   `{ok:false, code:'NOTHING_TO_DO'}`.
3. `listKeys(barcha STIR)` bir marta; `preflight()` bir marta; har firma uchun kalit/parol holati → `skipped{KEY_MISSING|KEY_EXPIRED|
   KEY_UNKNOWN|PASSWORD_MISSING|PASSWORD_REJECTED|KEY_CHANGED}`. E-IMZO ulanmasa → run `failed{EIMZO_NOT_RUNNING}` (oyna ochilmaydi).
4. Oyna **bir marta** ochiladi. Har firma: `resetSession()` → `loginFirm` → xatoda firma `failed{code}` (REJECTING_CODES →
   `markRejected`), fakturalari `skipped`, **keyingi firma davom etadi** (FR-8.8) → §5 tiklash (needs_check'lar) → **`api.listInvoices`
   qayta** (summa/holat yangilanadi; `draft!==null` bo'lib qolgan → `skipped{'allaqachon belgilangan'}`, summa o'zgargan → yangi
   `amount` olinadi — hali Didox'ga yozilmagan, xavfsiz) → har `pending` faktura `createDraft` (§4) → `logout` (best-effort,
   kafolat `resetSession`) → firma `done`.
5. Oyna yopiladi, run `done` | `cancelled` | `failed`. `pause` 2 s/faktura, 3 s/firma (`humanPauseMs` + sobit).

**Xato sinflari** (§15, FR-8.6; review M4) — aniq chegara:

| Sinf | Qachon | Faktura | Firma | Run |
|---|---|---|---|---|
| **Firma-stop** | 1–11 qadamda `StepError` (PAGE_UNEXPECTED, TIMEOUT, FORBIDDEN_ACTION, FORM_UNEXPECTED_VALUE, LIST_TRUNCATED, SAVE_FAILED, COUNTERPARTY_NOT_FILLED) | `error{code}` (+screenshot); 11-qadamda `saving` qolsa → `needs_check` | `failed`; qolgan fakturalar `skipped{'firma to'xtadi'}` | keyingi firma |
| **Faktura-darajali** | 0-qadam SIMILAR_DRAFT_EXISTS; 5-qadam COUNTERPARTY_MISMATCH; 12-qadam SAVED_ID_UNKNOWN / SAVED_ID_AMBIGUOUS; 13-qadam API 409/400 | `needs_check{code, didoxId?, candidateIds?}` | davom etadi | davom etadi |
| **Belgilash kechikdi** | 13-qadam tarmoq/5xx | `id_found` qoladi (1 marta 2 s dan keyin qayta) | davom etadi | davom etadi; xulosada "keyingi ochilishda belgilanadi" |
| **API yo'q** | 401 / API jarayoni o'lgan | `id_found` qoladi | — | `failed{API_UNAVAILABLE}`, joriy faktura kritik bo'limi tugagach |
| **Bekor** | `cancel()` | joriy: kritik bo'lim tugaydi (ID topilsa `id_found`→PUT urinib ko'riladi), aks holda `error{CANCELLED}` | qolgan `skipped{'bekor'}` | `cancelled` |

Deterministik faktura xatosi firmani keyingi oy ham to'xtatmasligi uchun — **skip belgisi** (§2, §7).

**Bekor qilish va kritik bo'lim (B4):**
- Runner ikki signal yuritadi: `cancelRequested` (foydalanuvchi) va `pageController: AbortController` (Page'ga beriladi).
  `cancel()` → `cancelRequested=true` → `inCritical ? kechiktir : pageController.abort()`. `exitCritical()` → kechikkan bo'lsa abort.
- **Kritik bo'lim** = 11-qadam ("Сақлаб қолиш" bosilishi) → 12-qadam (`id_found` diskka yozilishi). Ichida `Page` abort'ga javob
  bermaydi; o'z chegarasi `CRITICAL_MAX_MS = 45_000` (save 20 s + ro'yxat 15 s + zaxira) — o'tsa `pageController.abort()` baribir,
  faktura `saving` → `needs_check{INTERRUPTED_SAVE}`. 13-qadam kritik **emas** (ID diskda).
- `driver.step()` har qadam boshida `signal.aborted` tekshiradi — o'zgarmaydi; kritik bo'limdagi qadamlar `signal`ni
  `pageController.signal` sifatida oladi, u esa bo'lim ichida abort bo'lmaydi.
- **Heartbeat watchdog** (butun-run 180 s **o'rniga**): har `ProgressEvent` `lastBeatAt`ni yangilaydi; 30 s interval: `now − lastBeatAt >
  STALL_MS (120_000)` → `cancel()` (sabab `STALLED`); yana `STALL_GRACE_MS (60_000)` o'tsa ham `busy()` → **majburan**: `win.close()`
  (Page `PAGE_UNEXPECTED 'oynasi yopildi'` otadi, run tugaydi), journal: joriy faktura `saving`→`needs_check`, aks holda `error{STALLED}`,
  run `failed{STALLED}`. Qulf (`current`) faqat run promise'i tugagach bo'shaydi — zombi yo'q. `checkLogin` ham shu heartbeat'da;
  `DidoxRunnerDeps.watchdogMs` → `stallMs` (testlar kichik qiymat beradi; mavjud `run.spec.ts` moslanadi).
- `main.ts`: `before-quit` — `inCritical()` bo'lsa `CRITICAL_MAX_MS` gacha, aks holda 5 s kutadi. API child o'lsa: avval
  `didox.cancel()`, kritik bo'lim tugashini kutadi (≤45 s), keyin `showErrorBox` + quit (journal diskda). `win.on('closed', cancel)` qoladi.
- `view.ts`: `backgroundThrottling: false`; run davomida `powerSaveBlocker.start('prevent-display-sleep')` (tugagach `stop`).
  `close()` kritik bo'limda chaqirilmaydi (runner kafolatlaydi).

## 4. `steps/create-draft.ts` — bir faktura (FR-8.4; v1 0–13 **o'rniga**)

Kirish: `{ page, ctx: StepContext, item: InvoiceEntry, lenderTin, journal, api, clock }`. Har qadam `step(name, …)`.
Locator konstantalar (`locators.ts` forma qismi) **spike S2–S4 dan keyin** yoziladi; `// spike S2` belgisi bilan.

| # | Qadam | Nima qiladi | Tekshiruv / xato |
|---|---|---|---|
| 0 | `similarCheck` | `goto` ro'yxat `?tab=all&page=1&limit=100&partner=<borrowerTin>`; jadval yoki bo'sh holat kutiladi | `rows.length === 100` → `LIST_TRUNCATED` (firma-stop). `--white` + UUIDv1 vaqti ≥ `monthStart(M+1)` (Toshkent, UTC+5) + kalit mos (§5) → `needs_check{SIMILAR_DRAFT_EXISTS, candidateIds}` → keyingi faktura. ID v1 bo'lmasa → nomzod deb olinadi (fail-closed) |
| 1 | `openForm` | `goto /create_document`; tur select'lari kutiladi | "Диққат!" modal 2 s ichida chiqsa → "Ёпиш" → **modal yo'q bo'lguncha** kutiladi (10 s); chiqmasa — davom |
| 2 | `verifyType` | ikki `select.doc-types__select` tanlangan matni | ≠ "Ҳисоб-фактура актсиз" / "Стандарт" → `FORM_UNEXPECTED_VALUE` |
| 3 | `verifySeller` | sotuvchi STIR (disabled input) | ≠ `lenderTin` → `FORM_UNEXPECTED_VALUE` |
| 4 | `fillContract` | "Шартнома рақами": `clear` + `type`; "Шартнома санаси": `clear` + `type(ddmmyyyy)` | o'qib: raqam **aynan** `contractNumber`; sana `dd.mm.yyyy` === `contractSignedOn` |
| 5 | `fillCounterparty` | avval "Номи" qiymati o'qiladi (`before`); "СТИР/ЖШШИР" `clear`+`type(borrowerTin)`; `waitFor` 10 s: "Номи" bo'sh emas **va** `≠ before` | kutilmadi → `COUNTERPARTY_NOT_FILLED` (firma-stop). Nom normalizatsiya (kichik harf, `MCHJ|МЧЖ|ООО|LLC`, tirnoq/«», tinish, bo'shliq olinadi) — ilovadagi nom bilan **o'zaro qamrash** tekshiriladi; farq → `needs_check{COUNTERPARTY_MISMATCH, message: ikkala nom}` → keyingi faktura (Didox'da hech narsa yo'q) |
| 6 | `fillItem` | MXIK autocomplete: `type('10401999001000000')`; variantlar kutiladi (10 s) | aynan **bitta** variant, matni kod bilan boshlanadi → pointer click; keyin: birlik `xizmat (so'm)`, ҚҚС `ҚҚСсиз`, Имтиёз `102898` (matnlar spike S2) — farq → `FORM_UNEXPECTED_VALUE` |
| 7 | `fillDescription` | "изоҳ": `clear`+`type(lineName)` | o'qib aynan teng |
| 8 | `fillQtyPrice` | "Сони": `clear`+`type('1')`; "Нарҳ": `clear`+`type(formatForDidox(amountTiyin, DIDOX_DECIMAL_SEP))`; avto-hisob kutiladi (3 s) | §1: Нарҳ/етказиб/Жами === `amountTiyin`, ққс === 0n, Сони === "1" (raqam satri) — aks holda `FORM_UNEXPECTED_VALUE` |
| 9 | `setOrigin` | "Товарни келиб чиқиши" MUI select: pointer ochish → variant `ORIGIN_SERVICE_LABEL` (spike S3) → tanlangan matn | ≠ → `FORM_UNEXPECTED_VALUE`. SRS §9.1 "Оказание услуг" — ruscha chop etish yorlig'i; forma matni spike'dan |
| 10 | `verifyBlank` | "Ҳисоб-фактура рақами" va "Ҳужжат санаси" bo'sh; "Қўлда ҳисоблаш", "Акциз", "Тескари ҳисоб" belgilanmagan | aks holda `FORM_UNEXPECTED_VALUE` |
| 11 | `save` | journal `saving{savingAt: clock.now()}` **yoziladi (await)** → `enterCritical()` → click "Сақлаб қолиш" (aniq-matn locator; `Page.click` taqiq qo'riqchisi) → 20 s: URL `/documents/new/draft` **yoki** xato toast | toast → `SAVE_FAILED` (firma-stop), lekin `saving` **o'chirilmaydi** → `needs_check{SAVE_FAILED}` (saqlanmaganini isbotlab bo'lmaydi); timeout → `TIMEOUT`, xuddi shunday `needs_check` |
| 12 | `locateDraftId` | kritik bo'lim davom etadi: `goto` ro'yxat (`partner`, `limit=100`), topilmasa 3 s dan keyin `reload` (jami ≤15 s, ≤4 urinish) | §5 moslash, oyna `[savingAt − 2 daq, savingAt + 5 daq]`; **1** → journal `id_found{didoxId}` (await) → `exitCritical()`; 0 → `needs_check{SAVED_ID_UNKNOWN}`; ≥2 → `needs_check{SAVED_ID_AMBIGUOUS, candidateIds}`; `LIST_TRUNCATED` → `needs_check{LIST_TRUNCATED}` (ID bor, ro'yxat ishonchsiz) — hammasi `exitCritical()` bilan, keyingi faktura |
| 13 | `mark` | `PUT …/draft {didoxDocumentId, source:'didox', expectedAmount: item.amount}`; **`confirmWarnings` hech qachon yo'q** | 2xx → `marked`; 409 `AMOUNT_CHANGED` → `needs_check{AMOUNT_CHANGED, didoxId, "Didox'da eski summali qoralama bor"}`; 409 `CONFIRMATION_REQUIRED` → `needs_check{warnings[0].code, didoxId}`; 409 `DRAFT_CHANGED` → `needs_check{DRAFT_CHANGED, didoxId}`; 400 → `needs_check{API_REJECTED, didoxId, message}`; 401 → run `API_UNAVAILABLE`; tarmoq/5xx → 2 s → 1 qayta → `id_found` qoladi |

Qadam oralig'i `humanPauseMs()`; `type` 40–80 ms/belgi. "Didox'da yaratildi, ilovada yozilmadi" **hech qachon jim emas**: ID va sabab
`needs_check`da, xulosada va Fakturalar qatorida (§7).

## 5. O'z qoralamasini moslash — `didox/parse.ts` (B1.1, B3)

Sof funksiyalar, hammasi testli:
- `uuidV1TimeMs(id32hex): number | null` — version nibble `1` bo'lmasa `null`. 100-ns Gregorian → ms.
- `monthStartMs(month: 'yyyy-mm', offset: +1)`: `Date.UTC(y, m+1, 1) − 5h` (Asia/Tashkent, DST yo'q).
- `parseListRow(raw)` → `{ id, status: 'white'|'red'|'other', counterpartyTin, contractNumber, contractDate ('dd.mm.yyyy'), amountTiyin | null }`
  (locator xom matnlarni beradi; ustun [6] "№ va sana" uchun aniq regex; o'qib bo'lmasa `null` → mos emas, **fail-closed**).
- `matchOwnDraft(rows, key: { borrowerTin, contractNumber, contractDate, amountTiyin }, window: { fromMs, toMs }): { kind: 'one', id } | { kind: 'none' } | { kind: 'many', ids }`
  — `status==='white'` **va** 4 maydon aynan teng **va** `uuidV1TimeMs ∈ [from, to]`.
- Tiklash oynasi: `from = savingAt − 2 daq`, **`to = savingAt + 5 daq`** (`now` emas — B3). Bitta firma ichida ketma-ket ikki
  faktura bir-birining oynasiga tushmaydi: shartnoma № + **sana** kalitda.
- Qayerda ishlatiladi: 12-qadam (shu run), §3.4 tiklash (keyingi run, `needs_check` + `savingAt` + ID yo'q bo'lgan yozuvlar: ro'yxat
  o'qiladi → `one` → `id_found` → PUT; `none`/`many` → `needs_check` qoladi, xabar yangilanadi). **Faqat o'qiydi, hech qachon yaratmaydi.**
- 0-qadam o'xshashlik: oyna `[monthStartMs(M+1), +∞)`; mos qator bo'lsa — nomzod. Oldingi oyning imzolanmagan qoralamasi (vaqti M+1 dan
  oldin) hech qachon o'xshash emas (B3.4). Spike S4: UUIDv1 vaqti rost va server soatiga mos ekani ≥3 qoralamada tasdiqlanadi;
  tasdiqlanmasa — 0-qadam vaqt filtri o'rniga kontragent+№+sana+summa **va** `status white` (konservativ), 12-qadam esa
  "saqlashdan oldingi ro'yxat snapshot'ida yo'q, keyingisida bor" farqi bilan ishlaydi (fallback aniq yozilgan: 0-qadamdagi ro'yxat
  ID'lari saqlanadi, 12-qadamda yangi paydo bo'lgan mos qator aynan bitta bo'lsa — ID).

## 6. API mijozi — `api/jwt.ts`, `api/client.ts` (M1)

- `mintSessionToken(secret, { sub: 'desktop', ttlSec: 900 })` — HS256, `node:crypto` `createHmac`, payload `{ sub, iat, exp }`
  (`SessionPayload`); cookie `session=<token>` (`SESSION_COOKIE`). Sir `config.json` dagi `jwtSecret` (main allaqachon o'qiydi).
- `createApiClient({ baseUrl, secret })`: `listInvoices(month) → InvoiceList`, `markDraft(month, contractId, body) → { ok: true, row } |
  { ok: false, status: 409 | 400 | 401 | 5xx, code?, warnings?, message }`. Har so'rov yangi qisqa token. `fetch` — Node 24 global.
- API e2e (`auth.e2e-spec`): tashqarida yasalgan HS256 `{sub}` cookie qabul qilinadi; `alg:none`, boshqa sir, muddati o'tgan → 401.

## 7. IPC va web (B1.6, M6)

`bridge/contract.ts` (yangi, elektronsiz) — bridge tiplari shu yerda; `apps/web/src/lib/desktop.ts` **`import type`** bilan shu
fayldan oladi (vite build'ga tegmaydi, `tsc` mosligini tekshiradi) — "ikkalasini birga o'zgartiring" izohi o'rniga kompilyator.

| Kanal | Kirish → chiqish |
|---|---|
| `didox:create-drafts` | `{month, lenderIds: string[] \| 'all'}` → `{ok:true, runId}` \| `{ok:false, code, message}` |
| `didox:cancel` | → void |
| `didox:status` | → `RunJournal \| null` (joriy run; renderer reload'da qayta tiklanadi) |
| `didox:list-runs` | `{month?, limit?=5}` → `RunSummary[]` (runId, month, startedAt, finishedAt, status, counts) |
| `didox:get-run` | `{runId}` → `RunJournal` |
| `didox:invoice-flags` | `{month}` → `Record<contractId, { skipped?: {at}; needsCheck?: { runId, code, message, didoxId?, candidateIds?, at } }>` |
| `didox:skip-invoice` | `{month, contractId, skip: boolean}` → void |
| `didox:resolve-needs-check` | `{month, contractId}` → void ("Hal qilindi": bayroq olinadi; API'ga tegmaydi) |
| `didox:open-diagnostics` | → void (`shell.openPath(userData/didox-diagnostics)`) |
| `didox:check-login` | o'zgarmaydi |
| event `didox:progress` | `ProgressEvent` kengayadi: `{ runId?, firmTin, contractId?, invoiceIndex?, invoiceCount?, step, status, message? }` |

`maxInvoices` — IPC parametri **emas**: `process.env.DIDOX_MAX_INVOICES` (dev/gate), main o'qiydi. Barcha kanallar `guarded`, argument
validatsiya (`MONTH` regex API bilan bir xil, uuid, ≤200).

Web (`features/invoices/`):
- **"Didox'da qoralamalarni yaratish"** tugmasi — faqat desktop (`desktop.didox`), ≥1 `tayyor` (bayroqlar hisobga olinib). `DidoxRunDialog`:
  tasdiq (oy; beruvchilar ro'yxati — belgilash, sukut hammasi; soni; "Ilova hech narsa imzolamaydi va yubormaydi; klaviaturaga tegmang")
  → jonli log (firma sarlavhalari, faktura qatorlari `i/N` + qadam, `LoaderCircle/Check/X` — `CheckLoginDialog` uslubi) → "Bekor qilish"
  → xulosa (firma bo'yicha yaratildi / o'tkazildi / e'tibor kerak / xato; "Diagnostika papkasi"). Ochilganda `didox:status` — run
  davom etayotgan bo'lsa shu holatdan davom etadi. Yopilgach `invoicesKey` invalidatsiya.
- Qator holati = API `draft` + `didox:invoice-flags`: `needsCheck` → amber badge **"E'tibor kerak (Didox)"** + sabab + ID (nusxa) +
  amallar: **"Belgilash"** (mavjud `MarkDraftDialog`, ID oldindan to'ldirilgan; ogohlantirish bo'lsa dialogning o'zi `confirmWarnings`
  tasdig'ini so'raydi — buxgalter tugmasi), **"Hal qilindi"**, **"O'tkazib yuborish"**. `skipped` → kulrang badge "O'tkazib yuboriladi
  (Didox)" + "Bekor qilish". Odatiy `tayyor` qatorda "O'tkazib yuborish" ikkilamchi (menyu).
- **Banner** (Sir qarori 2): run davomida ilova sarlavhasi ostida bloklamaydigan chiziq — "Didox qoralamalari yaratilmoqda (oy) —
  hisobotni o'zgartiruvchi tahrirlardan saqlaning" (`useDidoxStatus`: `didox:status` + progress hodisasi). Tahrir bloklanmaydi;
  summa o'zgarsa API 409 `AMOUNT_CHANGED` → `needs_check` (jim xato yo'q).
- `DidoxRunsCard` — oxirgi 5 run (oy, vaqt, holat, soni), bosilsa run tafsiloti.

## 8. Xato kodlari — `contract.ts` ga qo'shiladi

`FORM_UNEXPECTED_VALUE`, `COUNTERPARTY_NOT_FILLED`, `COUNTERPARTY_MISMATCH`, `SIMILAR_DRAFT_EXISTS`, `LIST_TRUNCATED`, `SAVE_FAILED`,
`SAVED_ID_UNKNOWN`, `SAVED_ID_AMBIGUOUS`, `INTERRUPTED_SAVE`, `AMOUNT_CHANGED`, `ALREADY_DRAFTED`, `POSSIBLE_DUPLICATE`, `DRAFT_CHANGED`,
`API_REJECTED`, `API_UNAVAILABLE`, `STALLED`, `APP_CLOSED`, `SKIPPED_BY_USER`, `NOTHING_TO_DO`. Har kodga o'zbekcha xabar + UI `HINTS`.
`REJECTING_CODES` o'zgarmaydi. Qoida: 0–10 qadam xatosi = Didox'da hech narsa yo'q; 11+ = Didox'da qoralama bo'lishi mumkin — xabar matni
shuni aytadi ("Didox Қоралама'sini tekshiring").

## 9. `Page` kengayishi (M1)

`clear(snippet, {what})` — fokus + `select-all` + `Backspace` (`sendInputEvent`), keyin qiymat bo'shligi o'qiladi; `reload()`;
`selectOption(openSnippet, optionSnippet, {what})` — pointer ochish → variant pointer bosish → menyu yopilishi kutiladi (login'dagi
kalit menyusi namunasi). `FakePage.waitFor` **poll qiladi** (javob funksiyasi ketma-ket chaqiriladi, `pause` soxta soat bilan) —
"avto to'ladi" tarmoqlari testlanadi. `FakePage` `clear`/`reload`/`selectOption` yozib boradi.

## 10. Spike — real Didox, M8b real gate'dan keyin, Electron 44 (M3, M7)

Bir sessiya, Sir bilan, kodsiz (DevTools/kuzatuv), natija `docs/research/didox-flow.md §2c` ga; firma rekvizitlari yozilmaydi; fixture
HTML **sanitizatsiya** (nom/STIR/direktor → placeholder). Windows (eski "7") — **M8d** (Sir, M9 qarori).

| # | Savol | Natija qayerga |
|---|---|---|
| S1 | M8b real login gate (autotype bilan) — o'tmagan bo'lsa avval shu | PROGRESS |
| S2 | Forma yozish: shartnoma № (`/`, bo'shliq, kirill) va sana niqobi; kontragent avto-to'ldirish + "stale" (oldingi qiymat qoladimi); MXIK variantlar soni; birlik/ҚҚС/Имтиёз aniq matnlari; "Сони" sukuti va tozalash; **Нарҳ yozish formati** (`.`/`,`, ming ajratgich qabul qiladimi) va **o'qish formati** (Нарҳ/етказиб/Жами/ққс) `1.00`, `552328.77`, `15904000000.10` da; `sendInputEvent` kirill | `DIDOX_DECIMAL_SEP`, locator matnlari, `parseDidoxMoney` testlari |
| S3 | "Товарни келиб чиқиши" variant matni (`ORIGIN_SERVICE_LABEL`), MUI select pointer usuli, tanlanganini o'qish | locators |
| S4 | "Сақлаб қолиш" XHR URL'lari → `classifyRequest(url)==='allow'` regression testi (segmentda `sign\|tosign\|send` yo'qligi); ro'yxat yangilanishi (reload kerakmi), `limit=100`, tartib, ustun [6]/[7] formatlari; UUIDv1 vaqti ≥3 qoralamada soat bilan solishtiriladi | `net-policy.spec`, `parse.ts`, §5 fallback kerakmi |
| S5 | Sessiya: ikkinchi `/create_document`da modal; `clearStorageData` dan keyin login so'raladimi; **UI tili** toza sessiyada OS `ru-RU`/`en-US` bilan — majburlash usuli (cookie/localStorage/URL) yoki til-mustaqil locator | `view.ts` (til), locators |
| S6 | Oyna: `setEnabled(false)` + fon/yopilgan oyna → `sendInputEvent`, timerlar, `capturePage`; `backgroundThrottling:false` ta'siri; ekran uyqusi | `view.ts` |
| S7 | Tashlangan forma server-tomon avto-saqlanmaydi; test qoralamalar o'chiriladi | — |

Kodsiz yozib bo'lmaydiganlar (c1 locator'laridan oldin shart): `ORIGIN_SERVICE_LABEL`, MXIK variant soni, Нарҳ/Жami o'qish formati,
`DIDOX_DECIMAL_SEP`, select matnlari, saqlash endpoint'i.

## 11. TDD tartibi — vertikal bo'laklar (M5)

**c0 — poydevor (Didox'siz, hammasi fake):** SRS deltalari (§13) → `api/jwt` + API e2e → `api/client` (fake fetch) → `didox/money` (+
qo'riqchi test) → `didox/parse` (UUIDv1, `monthStartMs`, `parseListRow`, `matchOwnDraft`: ikki oy bir summa → noto'g'ri ID yo'q; oyna
chegaralari; `many`) → `didox/journal` (holat mashinasi, atomik yozish, `recoverStaleRuns`, `flushIdFound` har 2xx/409/400/401/tarmoq
tarmog'i, 50 ta rotatsiya) → `didox/skips` → `contract.ts` kodlari → `Page` kengayishi + `FakePage` poll → `run.ts` refaktor:
`loginFirm` ajratish (mavjud `checkLogin` testlari yashil qoladi), heartbeat (`stallMs`), kritik bo'lim (test: `cancel()` saqlash ichida →
ID topiladi va `id_found`/`marked`; `CRITICAL_MAX_MS` o'tsa → `needs_check`), majburiy to'xtatish → zombi yo'q.
*Gate c0:* `pnpm test` uch paketda yashil; real Didox yo'q.

**c1 — bitta faktura end-to-end (macOS, `DIDOX_MAX_INVOICES=1`):** spike S1–S7 → `locators` forma qismi + jsdom drift-fixture
(sanitizatsiya) → `steps/create-draft` (fake page: har qadamning har tarmog'i; taqiqlangan locator so'ralmaydi; `saving` yozuvi
klikdan oldin) → `createDrafts` bitta firma/bitta faktura → IPC `create-drafts`/`status`/`progress` → web tugma + `DidoxRunDialog`
(jonli log + xulosa) → qator "Qoralama yaratildi (Didox) · ID".
*Gate c1 (Sir bilan, real Didox):* 1 qoralama `552328.77`, izoh "SINOV" → Didox'da maydonma-maydon §9.1 → o'chiriladi → qayta run
hech narsa yaratmaydi (0-qadam yoki `draft!==null`).

**c2 — ko'p faktura, tiklash, UI:** ko'p firma/faktura, firma-stop/`skipped` semantikasi, `needs_check` + §5 tiklash, skip bayrog'i,
`invoice-flags` IPC + qator badge/amallar (`MarkDraftDialog` ID bilan), `list-runs` + `DidoxRunsCard`, banner, `before-quit`/API o'limi.
*Gate c2 (Sir bilan):* 2 firma × N; bekor qilish saqlash o'rtasida → ID topilib belgilanadi; ilova saqlash o'rtasida o'ldiriladi
(`kill -9`) → `needs_check` → keyingi run tiklaydi; noto'g'ri parol bir firma → boshqa firma davom etadi; selector ataylab buzilsa
screenshot bilan firma to'xtaydi, boshqa firma davom etadi. macOS'da qabul, "Windows tasdiqlanmagan" belgisi.

## 12. Acceptance (SRS M8 + v5)

- Didox Қоралама'dagi qoralamalar §9.1 ga maydonma-maydon mos (№/sana bo'sh, ҚҚСсиз, "Хизmat кўрсатиш" varianti, summa tiyinigacha).
- ID'lar ilovada `source: didox`, `expectedAmount` tekshirilgan; qayta run **hech narsa yaratmaydi**.
- "Didox'da yaratildi, ilovada yo'q" holati **har doim** `needs_check` bilan ko'rinadi (jim yo'q): crash, bekor, 409, API yo'q — barchasi.
- Bekor qilish yarim belgi qoldirmaydi: saqlash ichida bekor → ID topiladi; topilmasa `needs_check`.
- Noto'g'ri parol — bir urinish, firma belgilanadi, boshqa firmalar davom etadi. Didox elementi o'zgarsa — screenshot bilan firma to'xtaydi.
- Skip belgisi qo'yilgan faktura keyingi run'larda o'tkaziladi; olib tashlansa yana `tayyor`.
- Run davomida tahrir mumkin; summa o'zgargan faktura `needs_check{AMOUNT_CHANGED}` bilan to'xtaydi, boshqalari davom etadi.
- Hech qachon: Имзолаш/Юбориш bosilmaydi (uch qavat), `sign|tosign|send` tarmoqda to'siq, `confirmWarnings` ilovadan yuborilmaydi.

## 13. SRS deltalari (c0 birinchi qadami — FR'lar oldin)

- **FR-8.5:** "karantin" → `needs_check` atamasi; ilova read-only tiklash qilishi mumkin (faqat o'zi boshlagan saqlash, vaqt oynasi), hech
  qachon yaratmaydi/belgilamaydi; **"o'tkazib yuborish" belgisi** (Sir, 2026-10-13) — buxgalter fakturani shu oy uchun o'tkazadi.
- **FR-8.6:** firma-stop (sahifa farqi) va faktura-darajali (o'xshash qoralama, summa o'zgargan, ID topilmadi) farqi.
- **FR-8.7:** natijalar `userData/didox-runs` (lokal), oxirgi 50; ilova ochilganda tugamagan run tiklanadi (holatlar).
- **FR-8.4:** run davomida ilova bloklanmaydi; `expectedAmount` bilan belgilash; summa o'zgarsa `needs_check`.
- §9.1 "Kelib chiqishi" — forma varianti matni spike bilan (ruscha chop yorlig'i "Оказание услуг" saqlanadi).

## 14. Ochiq (Sir uchun, bloklamaydi)

1. `COUNTERPARTY_MISMATCH` — nom farqida to'xtash (tavsiya) yoki faqat xulosada ko'rsatish? *v5: to'xtash, faktura-darajali.*
2. Bir STIR'ga bir nechta amaldagi kalit — `validTo` eng uzog'i (M8b xulqi) qoladi.
3. c2 dan keyin: Didox header firma almashtirgichi (bitta login → bir nechta firma) — optimallash, M8d/M8e.
