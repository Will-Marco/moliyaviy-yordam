# PLAN — Modul 8: Didox — avtomatik qoralamalar (yo'l B, DOM boshqaruvi)

> Maqsad: buxgalter ilovada "Didox'da qoralamalarni yaratish"ni bossa (yoki oy 1-kuni 06:00 avtomatik),
> ilova har beruvchi firma uchun Didox'ga **o'zi** ERI bilan kiradi (E-IMZO paroliga o'zi yozadi), o'tgan oyning
> `tayyor` fakturalari uchun Didox formasini to'ldirib **qoralama** saqlaydi, qoralama ID'sini yozib qo'yadi va chiqadi.
> Ilova hech qachon imzolamaydi (CONSTITUTION §12).

Status: **reja v2 (Fable, 2026-10-12)** — plan-reviewer o'tdi, Sir ochiq qarorlarni berdi → **Sir gate** → qurish Opus sessiyada (M8a dan).
Manbalar: docs/research/didox-flow.md (login, E-IMZO, forma, sinov qoralamasi — hammasi real Didox'da tekshirilgan),
docs/research/e-imzo.md, CONSTITUTION §12–16, SRS §9.1–9.2, PROGRESS qaror jurnali (2026-10-12).

## Sir qarorlari (2026-10-12, qayta muhokama qilinmaydi)
- Har firma — alohida ERI kaliti; firma ↔ kalit **STIR** bo'yicha (alias `1.2.860.3.16.1.1`). Kalitni ilova tanlaydi.
- Kirish **to'liq avtomatik**: ERI paroli ilovada `safeStorage` (DPAPI/Keychain) bilan saqlanadi va E-IMZO'ning **o'z
  oynasiga** ilova yozadi (macOS spike yashil). CONSTITUTION §13.
- **Jadval birinchi versiyada** (M8d ham shu modulda; Windows adapteri — Windows gate).
- Didox oynasi ish paytida **ko'rinadi**; barcha beruvchi firmalar **ketma-ket, tanlash mumkin**.

## Tekshirilgan faktlar (dizaynni belgilaydi)
1. **Electron 34 ichida Node 20 — global `WebSocket` yo'q** (spike Node 24 da edi) → `ws` paketi (`apps/desktop` dependency);
   `ws` ning `WebSocketServer`i testlarda fake E-IMZO bo'ladi.
2. API auth: cookie `session`, HS256 JWT, payload `{sub}`, sir = `JWT_SECRET` (`auth.guard.ts`, `auth.module.ts`). Desktop
   main `config.jwtSecret`/`username`ni o'zi yaratadi → main **service token**ni o'zi imzolaydi (`node:crypto`, ~15 qator).
3. App oynasida preload yo'q; `setup-preload.js` (CommonJS `contextBridge`) namuna.
4. `invoice_drafts.didoxDocumentId varchar(100)` — Didox UUIDv1 hex (32) sig'adi. `PUT …/draft` mavjud bo'lsa 409 — avtomatika
   hech qachon `confirmWarnings:true` yubormaydi (FR-8.5 server tomonda bepul).
5. Didox qoralama ro'yxati: `/documents/new/draft?tab=all&partner=<STIR>` — kontragent STIR bo'yicha **URL orqali filtr**
   (tekshirildi); qator ustunlari: [4] kontragent nom+STIR, [6] shartnoma № va sana, [7] ҚҚСсиз summa, [2] holat
   `.doc-status--white` (faol) / `.doc-status--red` (o'chirilgan — **o'chirilganlar ham ro'yxatda qoladi**); har katak
   `<a href="/documents/{32hex}/1">`. "Яратилган" tabi bo'sh — ishlatilmaydi.
6. Web testlar `vi.stubGlobal` + `vi.unstubAllGlobals()` → `window.desktop` stub bepul.

## Bo'linish va tartib

| # | Bo'lim | Hajm | User-visible harakat | Gate |
|---|---|---|---|---|
| **M8a** | ERI kalitlar va parollar | standard | Firmalar sahifasida har firma yonida "Kalit · 21.01.2028 gacha / Muddati o'tgan / Kalit yo'q" va "ERI parolini kiritish" (faqat desktop) | macOS, real E-IMZO |
| **M8b** | Avtomatik Didox kirish | complex | Firma yonida "Kirishni tekshirish" → ilova Didox oynasida kalitni tanlab, E-IMZO paroliga o'zi yozib kiradi, firmani STIR bilan tasdiqlaydi, chiqadi | macOS, real Didox, Sir oldida |
| **M8c** | Qoralama yaratish | complex | Fakturalar sahifasida "Didox'da qoralamalarni yaratish" (oy × firmalar) → jonli jarayon → qatorlar "Qoralama yaratildi (Didox) · ID" | oraliq gate: **1 ta** real qoralama (552328.77) → o'chiriladi; yakuniy: 2 firma × N |
| **M8d** | Jadval, tray, avtostart, Windows | standard + Windows gate | Oy 1-kuni 06:00 avtomatik (07:00/08:00 qayta urinish, catch-up); tray; Windows'da parol yozish | macOS'da mantiq; Windows PC'da adapter |

Tartib: M8a → M8b → M8c → M8d. **SRS M8 qayta yozish — M8a'ning 1-qadami** (FR'lar oldin, keyin kod).
M8a alohida: sof testlanadigan qatlam (alias parser, moslashtirish, store) va mustaqil foyda (kalit muddati ko'rinadi).
M8c bo'linmaydi (firma = login bir marta → N qoralama → chiqish — tabiiy birlik); o'rniga `maxInvoices: 1` dev-toggle bilan oraliq gate.

## Arxitektura (Electron main — Didox drayveri; API — haqiqat manbai; web — UI)

### Fayl tuzilmasi (`apps/desktop/`, yangi)
```
package.json           + deps: ws; devDeps: vitest, typescript; scripts: build (tsc), dev (tsc && electron .), test
tsconfig.json          strict, module nodenext, outDir dist — main entry dist/main.js (qaror A quyida)
src/main.ts            MOD: app oynasiga preload, servislarni ulash (api, eri, eimzo, runner), before-quit
src/bridge/preload.cjs window.desktop = { platform, eri.{listKeys,setPassword,removePassword}, didox.{checkLogin,createDrafts,cancel,openDiagnostics,onProgress} }
src/bridge/ipc.ts      ipcMain.handle ro'yxati; har handler guarded(): sender.id === appWin.webContents.id && senderFrame.url.startsWith(baseUrl)
src/api/jwt.ts         mintSessionToken({sub, secret, ttl: 300}) — HS256, base64url (sof)
src/api/client.ts      createApiClient({baseUrl, username, jwtSecret, fetch}) → GET /api/invoices, PUT …/draft, didox-runs
src/eimzo/client.ts    listCertificates({url, WebSocket, timeoutMs}) → {disk,path,name,alias}[]; ECONNREFUSED → EIMZO_NOT_RUNNING
src/eimzo/alias.ts     parseAlias(alias) → {tin, org, title, validFrom, validTo, serial} — JShShIR/F.I.Sh. SAQLANMAYDI
src/eimzo/match.ts     matchKeys(certs, companies, today) → Map<tin, {status:'ok'|'expired'|'missing', validTo?}>; bir nechta amaldagi → validTo eng uzog'i
src/secrets/eri-store.ts  createEriStore({file, safeStorage}) — set/status/remove/markRejected/withPassword(tin, fn)
src/didox/view.ts      createDidoxWindow({partition:'persist:didox'}) + createPage(webContents) — goto/url/waitFor/read/click/type/pause/screenshot/reload
src/didox/locators.ts  BARCHA Didox DOM bilimi bir joyda (JS snippet satrlari + o'zbekcha nom); FORBIDDEN: Имзолаш/Юбориш
src/didox/driver.ts    runSteps(steps, page, ctx, {onProgress, cancel}) — timeout, StepError, xatoda screenshot, qayta urinish YO'Q
src/didox/steps/login.ts, create-draft.ts, logout.ts
src/didox/autotype/{index,darwin,win32}.ts + eimzo-password.jxa.js (macOS), send-eimzo-password.ps1 (Windows, M8d)
src/didox/run.ts       createRunner({api, eri, eimzo, openWindow, autotype, clock}) — firma→faktura orkestratsiya, lock, cancel, natija
src/didox/diagnostics.ts  userData/didox-diagnostics (screenshot + log, oxirgi 20 ta, parol/JShShIR hech qachon)
src/scheduler/*.ts     M8d: nextRun (sof), catch-up, tray, login item, powerMonitor
```
Faqat `main.ts`, `bridge/ipc.ts`, `didox/view.ts`, `scheduler` `electron`ni import qiladi; qolgani bog'liqliklarni parametr
sifatida oladi — testlanish shundan.

**Qaror A — desktop TS'ga o'tadi** (CONSTITUTION "TypeScript strict"; ~20 modul JS+JSDoc bilan og'ir). `tsc` build
(`src → dist`), `electron-builder.yml` `files: dist/**`, `prepare-resources.mjs` desktop build qo'shadi. `main.js`/`config.js`
(kichik) TS'ga ko'chadi. Zaxira: JS + `checkJs` — reviewer bahosi.

### Main → API: **service JWT** (renderer proxy emas)
Har so'rovda 5 daqiqalik `{sub: username, iat, exp}` HS256 token, `Cookie: session=<jwt>`. Sabab: jadval ishga tushganda
renderer bo'lmasligi mumkin; natija UI yopiq bo'lsa ham yozilishi shart; httpOnly cookie'ni renderer baribir berolmaydi.
Isbot: API e2e "tashqarida HS256 bilan imzolangan `{sub}` cookie qabul qilinadi" (mint testda `node:crypto` bilan qayta
yoziladi — ikki tomon ajrasa test sinadi).

### Didox oynasi
`new BrowserWindow({partition:'persist:didox', contextIsolation, sandbox, nodeIntegration:false})`, **preload yo'q**.
`will-navigate`/`setWindowOpenHandler` — faqat `https://didox.uz` va `*.didox.uz`, qolgani rad (tashqariga ochilmaydi).
`will-prevent-unload` → preventDefault (yarim to'ldirilgan forma navigatsiyani to'smaydi). Ish paytida
`setIgnoreMouseEvents(true)` + ilovada "Didox bilan ishlanmoqda — tegmang" banneri. Firma almashganda
`session.clearStorageData()` + `clearCache()` → toza login (Didox'dagi "chiqish" tugmasiga bog'liq emas). "Запомнить на 6 час."ga
tegilmaydi. `certificate-error` fallback **qo'shilmaydi** (Chrome'da Didox↔E-IMZO ishladi; kerak bo'lsa keyin, faqat
`wss://127.0.0.1:64443` ga chegaralab).

### Page abstraksiyasi va yozish usuli
`page.type` — `executeJavaScript(focus)` so'ng `webContents.sendInputEvent({type:'char'})` har belgi 40–80 ms jitter bilan
(haqiqiy klaviatura — Chrome sinovida ishlagan usul). Zaxira: `document.execCommand('insertText')` (React `input` yo'li,
tartibga bog'liq emas) — M8c birinchi spike'ida yakuniy tanlanadi. `page.click` — `scrollIntoView + click()`; MUI menyu
bandlari uchun `needsPointer` → `sendInputEvent(mouseDown/mouseUp)`. **Qo'riqchi:** `click` matni `/Имзолаш|Юбориш|Подписать|Отправить/`
bo'lsa `ForbiddenAction` (§12, locator'da bunday tugma umuman yo'q — bu ikkinchi qavat).

### Login qadamlari (`steps/login.ts`)
1. `ensureEimzoKey` — E-IMZO ro'yxati → firma STIR; `EIMZO_NOT_RUNNING` butun run'ni to'xtatadi; `KEY_MISSING`/`KEY_EXPIRED` — firma o'tkaziladi.
2. `resetSession` — `clearStorageData()`.
3. `openLogin` — `https://didox.uz/login_with_signature?r=/documents/new&isInternal=true`; "Калитингизни танланг" kutiladi.
4. `pickKey` — menyu → `.certs-select__item` ichida `.certs-select__inn === STIR` (bir nechta bo'lsa `.certs-select__expire` =
   tanlangan kalitning `validTo`) → bosiladi; tanlangan STIR tekshiriladi. Yo'q → `KEY_NOT_IN_DIDOX_LIST`.
5. `armAutotypeAndEnter` — **avval** autotype ishga tushadi (E-IMZO oynasini kutadi, 20 s), 300 ms dan keyin "Кириш" bosiladi.
   Natija: `typed` / `no_dialog` → `EIMZO_DIALOG_MISSING` / `rejected` (oyna Return'dan 3 s keyin hali ochiq → **bir marta** Escape,
   exit 3) → `WRONG_PASSWORD` → `eri.markRejected(tin)`; firma to'xtaydi; **ikkinchi urinish yo'q** (§13, §15).
6. `awaitLogin` — 45 s ichida URL `https://didox.uz/documents…`; bo'lmasa `LOGIN_FAILED` (Didox toast matni bilan).
7. `verifyFirm` — sarlavhadagi firma STIR'i (header switcher "303 471 702" ko'rinishida; bo'shliqlar olib tashlanadi) === firma STIR;
   zaxira — `/create_document` dagi `disabled` sotuvchi STIR maydoni. Mos kelmasa `WRONG_FIRM`. "Kirishni tekshirish" aynan shu
   7 qadam + `logout`.

### Qoralama qadamlari (`steps/create-draft.ts`, har faktura)
0. `precheck` — `goto /documents/new/draft?tab=all&partner=<oluvchi STIR>`; `.doc-status--white` qatorlar ichida shartnoma № +
   ҚҚСсиз summa mos bo'lsa → ID olinadi, `already`, 12-qadamga. (Ilova yiqilib PUT bo'lmagan holatga idempotentlik.)
1. `openForm` — `/create_document`; "Диққат!" bo'lsa (3 s) "Ёпиш"; toast'lar e'tiborsiz.
2. `verifyType` — ikki `select.doc-types__select`: "Ҳисоб-фактура актсиз" / "Стандарт".
3. `verifySeller` — sotuvchi STIR (disabled) === beruvchi STIR.
4. `fillContract` — "Шартнома рақами" → raqam, tekshir; "Шартнома санаси" → `ddmmyyyy` yoziladi, `dd.mm.yyyy` o'qiladi.
5. `fillCounterparty` — kontragent STIR → 10 s ichida "Номи" to'lishi kutiladi (nom log'ga, qattiq solishtirilmaydi).
6. `fillItem` — MXIK maydoniga `10401999001000000` → autocomplete'da **aynan bitta** variant → bosiladi → tekshir:
   birlik `xizmat (so'm)`, ҚҚС `ҚҚСсиз`, imtiyoz `102898`. Farq → `FORM_UNEXPECTED_VALUE` (firma to'xtaydi, screenshot).
7. `fillDescription` — `lineName` (API'dan, §9.1 shablon).
8. `fillQtyPrice` — Сони `1`; Нарҳ = summa (format oraliq gate'da aniqlanadi); ko'rsatilgan Нарҳ/Жами normalizatsiya
   (bo'shliq/NBSP olib, `,`→`.`) === summa; ҚҚС summasi `0`/`0.00`.
9. `setOrigin` — "Товарни келиб чиқиши": "Олди-сотди" → `ORIGIN_SERVICE_LABEL` ("Хизмат кўрсатиш" — spike'da aniq matn).
10. `verifyBlank` — faktura raqami/sanasi bo'sh (§9.1).
11. `save` — "Сақлаб қолиш" → 20 s ichida URL `/documents/new/draft`; toast xato → `SAVE_FAILED`.
12. `locateDraftId` — 0-qadamdagi qidiruv (`partner=<STIR>`, bir marta reload) → eng yangi mos `--white` qator → href `/documents/{32hex}/1`.
    Topilmasa → `SAVED_ID_UNKNOWN`: **belgilanmaydi**, "Saqlangan bo'lishi mumkin, ID topilmadi — keyingi urinishda tekshiriladi".
13. `recordDraft` — `PUT /api/invoices/:month/:contractId/draft {didoxDocumentId, source:'didox'}` (`confirmWarnings`siz);
    409 → `RACE_ALREADY_MARKED`.
Tezlik: 40–80 ms/belgi, 300–800 ms/harakat, 2 s/faktura, 3 s/firma → ~60–90 s/faktura.

### Orkestratsiya (`run.ts`)
`start({month, lenderIds|'all', maxInvoices?, trigger:'manual'|'scheduled'|'check-login'})`. Bir vaqtda bitta run
(`RUN_IN_PROGRESS`). Oqim: `GET /api/invoices?month` → `draft===null` qatorlar beruvchi STIR bo'yicha → `POST /api/didox-runs`
→ E-IMZO tekshiruvi bir marta → Didox oynasi → har firma: `eri.status` (`missing`→"Parol kiritilmagan", `rejected`→"Parol rad
etilgan — qayta kiriting" — o'tkaziladi) → login → fakturalar → logout → keyingi → `PATCH /api/didox-runs/:id` → oyna yopiladi.
Faktura ichidagi `StepError` **shu firmani** to'xtatadi (Didox holati noma'lum, §15), qolganlari `skipped`, keyingi firma davom
etadi. `cancel()` — joriy `waitFor` erta chiqadi, forma tashlanadi, run `cancelled`. `before-quit` → cancel + ≤5 s kutish.

### Sirlar oqimi
Renderer dialog → `eri:set-password {tin, password}` → guarded → `safeStorage.isEncryptionAvailable()` (Linux `basic_text` rad)
→ `encryptString` → `userData/eri-secrets.json` `{[tin]: {cipher, serial, updatedAt, rejectedAt?}}` (0600, temp+rename).
Parol faqat `withPassword(tin, fn)` ichida ochiladi, autotype bola jarayoniga **stdin** orqali beriladi (argv `ps`da, env
same-user'da ko'rinadi; stdin — xususiy quvur). macOS skripti **JXA** (`osascript -l JavaScript`, stdin o'qiy oladi;
AppleScript o'qiy olmaydi). IPC parolni hech qachon qaytarmaydi (`status: set|missing|rejected`). Kalit seriyasi o'zgarsa →
"Kalit yangilangan — parolni qayta kiriting".

### Autotype adapterlari
- **darwin (hozir):** JXA — `System Events` `processes['E-IMZO'].windows.length>0` kutadi (timeout arg), `setFrontmost`,
  `keystroke(pw)`, `keyCode(36)`; 3 s keyin oyna hali bo'lsa `keyCode(53)` bir marta → exit 3; exit 2 — oyna chiqmadi.
  Ruxsatlar: Accessibility (`systemPreferences.isTrustedAccessibilityClient(true)` birinchi marta so'raydi) + Automation
  (`NSAppleEventsUsageDescription` — electron-builder `mac.extendInfo`). Dev'da grantee "Electron", paketda "Moliyaviy yordam".
  **Klaviatura tartibi:** `keystroke` joriy manbaga bog'liq → pre-flight: manba lotin bo'lmasa run **to'xtaydi** ("Klaviaturani
  ABC/US ga o'tkazing") — noto'g'ri yozilgan parol = `rejected` + qayta kiritish, bundan arzon.
- **win32 (M8d):** PowerShell `Add-Type` P/Invoke `SendInput` + `KEYEVENTF_UNICODE` (tartibdan mustaqil), E-IMZO oynasi
  `javaw`/E-IMZO jarayoni bo'yicha, parol `[Console]::In.ReadToEnd()`. Native Node modul yo'q.

### IPC yuzasi
`eri:list-keys` → `{eimzo:'ok'|'not_running'|'error', keys:[{tin,org,title,validTo,status}], passwords:{[tin]:'set'|'missing'|'rejected'}}`;
`eri:set-password`, `eri:remove-password`; `didox:check-login {tin}`; `didox:create-drafts {month, lenderIds, maxInvoices?}` →
`{ok, runId}`; `didox:cancel`; `didox:open-diagnostics`; event `didox:progress {firmTin, invoice?, step, status, message}`.

## API o'zgarishlari (minimal, Didox'ni bilmaydi)
1. `invoice_drafts.source varchar(10) NOT NULL DEFAULT 'manual'` + CHECK `IN ('manual','didox')` (migratsiya + Prisma +
   `MarkDraftDto.source? @IsIn` + `draft.source` javobda). UI: "Qoralama yaratildi (Didox)".
2. **`didox_runs`** jadvali: `{id, month char(7), trigger, started_at, finished_at?, status running|done|failed|cancelled,
   items jsonb}`; `POST /api/didox-runs`, `PATCH /api/didox-runs/:id`, `GET /api/didox-runs?month&limit`, `GET /:id`.
   Sabab: FR-8.7 tarix qayta ishga tushganda saqlanishi, M8d catch-up "bu oy bajarilganmi"ni bilishi kerak; ikkinchi JSON
   ombor o'rniga bitta PGlite. `running` 6 soatdan eski → UI "to'xtab qolgan". Modul `apps/api/src/didox-runs/` + e2e.
3. API'da sir, E-IMZO, Didox DOM bilimi **yo'q** (SRS §7 "didox adapter apps/api'da" → `apps/desktop`).

## Web o'zgarishlari
- `src/desktop.d.ts` (`Window.desktop?: DesktopBridge`), `lib/desktop.ts` `useDesktop()` (UA sniffing yo'q).
- `features/eri/`: `useEriKeys` (`enabled: !!desktop`), `EriPasswordDialog` (RHF+zod; eslatma "faqat shu kompyuterda, OS shifri
  bilan, qayta ko'rsatilmaydi"; yuborilgach maydon tozalanadi), `EriStatusCell` (badge'lar: kalit/muddat/yo'q/E-IMZO ishlamayapti;
  parol bor/yo'q/rad etilgan; "ERI parolini kiritish", "Kirishni tekshirish").
- `CompaniesPage`: "ERI" ustuni faqat desktop'da; "E-IMZO'dan yangilash".
- `features/invoices/DidoxRunDialog.tsx`: tasdiq ekrani (oy, firmalar ro'yxati — belgilash/olib tashlash, soni, "Ilova imzolamaydi")
  → jonli log (firma sarlavhasi, faktura qadam qatorlari, `LoaderCircle/Check/X`) → "Bekor qilish" → xulosa (yaratildi/o'tkazildi/xato
  firma bo'yicha, "Diagnostika papkasi") → `invoicesKey` invalidatsiya. `DidoxRunsCard` — oxirgi 5 run.
- Asosiy tugma "Didox'da qoralamalarni yaratish" faqat desktop'da va `tayyor` qator bo'lsa; "Belgilash" qatorda ikkilamchi qoladi.

## Xato va xavfsizlik semantikasi
| Holat | Xulq |
|---|---|
| E-IMZO ulanmaydi | Run Didox ochilmasdan to'xtaydi: "E-IMZO ishga tushirilmagan" |
| Kalit yo'q/muddati o'tgan | Firma sababi bilan o'tkaziladi |
| Parol yo'q/rad etilgan | Firma o'tkaziladi; qayta kiritilguncha urinilmaydi |
| E-IMZO oynasi 20 s chiqmadi | `EIMZO_DIALOG_MISSING`, screenshot, firma to'xtaydi |
| Noto'g'ri parol | Bir marta yoziladi; oyna qolsa Escape → `WRONG_PASSWORD`, `markRejected`; **hech qachon qayta urinilmaydi** |
| Login 45 s da bo'lmadi / noto'g'ri firma | `LOGIN_FAILED` / `WRONG_FIRM`, firma to'xtaydi, chiqish |
| Selector topilmadi / kutilmagan qiymat | `StepError` + screenshot `userData/didox-diagnostics/`, firma to'xtaydi, maydon nomi o'zbekcha |
| Yarim forma | Tashlanadi (`will-prevent-unload` bosilgan); firma to'xtagan |
| Saqlandi, ID topilmadi | Belgilanmaydi; xabar; keyingi run precheck topadi |
| Ilovada allaqachon qoralama | Yuborilmaydi; API 409 ikkinchi to'siq |
| Didox'da allaqachon bor (precheck) | Topilgan ID bilan `already` |
| Ikkinchi run | `RUN_IN_PROGRESS` |
| Bekor / ilova yopilishi | Qadam tugaydi, qayta urinish yo'q, run `cancelled`; `before-quit` ≤5 s |
| Timeout'lar | sukut 15 s; login 45 s; autofill 10 s; MXIK 10 s; save 20 s |
| Hech qachon | Имзолаш/Юбориш bosish, `load_key`/`create_pkcs7`, `.pfx` o'qish, "Запомнить" |

## SRS Modul 8 — yangi FR'lar (M8a 1-qadamida yoziladi)
FR-8.1 ERI kalitlar (E-IMZO ro'yxati, STIR moslik, muddat; shaxsiy maydonlar saqlanmaydi) · FR-8.2 ERI paroli (safeStorage,
ko'rsatilmaydi/log'lanmaydi/tarmoqqa chiqmaydi, holatlar) · FR-8.3 Avtomatik kirish (kalit tanlash, "Кириш", E-IMZO oynasiga bir
marta yozish, STIR bilan tasdiq; "Kirishni tekshirish") · FR-8.4 Qoralama yaratish (forma, tekshiruvlar, raqam/sana bo'sh, ID
yozish, `source: didox`) · FR-8.5 Takror yo'q (ilova filtri + Didox precheck + API 409) · FR-8.6 Inson tezligi va to'xtash ·
FR-8.7 Natijalar (`didox_runs`, jonli progress) · FR-8.8 Login xatosi (firma to'xtaydi, qayta urinish taqiq, parol qayta kiritish
bilan ochiladi) · FR-8.9 Imzolamaydi (kod qo'riqchisi) · FR-8.10 Jadval (06:00 Asia/Tashkent o'tgan oy uchun; 07:00/08:00 faqat
vaqtinchalik kodlar; catch-up ishga tushganda/uyg'onganda; shartlar bajarilmasa xabar). Shuningdek SRS §6/§7/§9 sarlavhalari.

## TDD tartibi va Acceptance
**M8a:** SRS → desktop TS/vitest skelet (birinchi qizil test `alias.spec.ts`) → `alias` → `match` → `eimzo/client` (fake `ws`
server) → `eri-store` (fake safeStorage: 0600, `withPassword` sizmaydi, `markRejected`, buzuq JSON) → `isTrustedSender` → preload →
main ulash → web `useDesktop`, `EriStatusCell`, `EriPasswordDialog`, `CompaniesPage` ustuni (testlar `vi.stubGlobal`).
*Acceptance:* Sir Mac'ida E-IMZO bilan firmalar sahifasi to'g'ri kalit/muddatni ko'rsatadi, E-IMZO yopilsa "ishlamayapti";
parol saqlanib qayta ochganda "Parol bor"; `eri-secrets.json`da ochiq matn yo'q; uch paketda `pnpm test` yashil.

**M8b:** `api/jwt` + API e2e (tashqi cookie) → `api/client` → `driver` (timeout/cancel/progress) → `locators` login qismi →
`steps/login` (fake page: har tarmoq) → `autotype/darwin` (fake spawn: stdin bir marta, exit 0/2/3) → JXA skript (qo'lda spike) →
`view` → `run` check-login → IPC → web "Kirishni tekshirish".
*Acceptance:* real firmada klaviaturaga tegmasdan kiradi, firmani tasdiqlaydi, chiqadi (keyingi ochishda login so'raydi); ataylab
noto'g'ri parol → bir marta yozadi, "parol rad etildi", firma belgilanadi, qayta urinmaydi; E-IMZO yopiq → Didox ochilmaydi.

**M8c:** API `source` + `didox_runs` (e2e) → `locators` forma qismi → `steps/create-draft` (fake page: barcha tekshiruv tarmoqlari,
taqiqlangan locator so'ralmaydi) → `run` to'liq (guruhlash, firma-to'xtash, lock, cancel, yozuv) → IPC → web `DidoxRunDialog`,
`useDidoxRuns` → tugma. **Oraliq gate** (Sir bilan, `maxInvoices:1`, 552328.77, izoh "SINOV"): yozish usuli, narx formati,
"Хизмат кўрсатиш" matni aniqlanadi; locators/fixture yangilanadi; qoralama o'chiriladi; qayta run — precheck `already`.
*Acceptance:* 2 firma × bir nechta faktura → qoralamalar §9.1 ga maydonma-maydon mos, ID'lar yozilgan, qayta run hech narsa
yaratmaydi; bekor qilish yarim belgi qoldirmaydi; selector ataylab buzilsa screenshot bilan to'xtaydi.

**M8d:** sof `nextRun`/catch-up testlar → tray + login item + `powerMonitor` → jadval trigger → `win32` adapter (fake spawn) →
PowerShell spike Windows'da → NSIS paket. *Acceptance:* soat 1-kuni 05:59 → 06:00 o'tgan oy uchun run; vaqtinchalik xato →
07:00 faqat o'sha fakturalar; 3-kuni ochilsa catch-up; Windows'da parol tartibdan mustaqil yoziladi.

## Reviewer uchun ochiq savollar
1. Noto'g'ri parolni aniqlash E-IMZO oynasi qolishiga tayanadi; E-IMZO oynani yopib Didox xato ko'rsatsa — 45 s `LOGIN_FAILED`
   yagona signal. Yetarlimi? Skriptning bir martalik Escape'i (bekor, qayta urinish emas) — ruxsatmi?
2. Yozish: `sendInputEvent` (asosiy) vs `execCommand('insertText')` — spike'da hal qilish to'g'rimi?
3. Service JWT (loopback, bitta foydalanuvchi) — yetarlimi, yoki alohida loopback header + guard?
4. `didox_runs` API'da (tavsiya) vs `userData` JSON — API "run" tushunchasini bilishi (Didox'siz) qarshilik bormi?
5. Bitta STIR'ga bir nechta amaldagi kalit → `validTo` eng uzog'i, so'rovsiz — ma'qulmi? (Sir hali javob bermagan.)
6. Qaror A (desktop TS + tsc build) vs JS+checkJs — qurish/dev tezligi vs qat'iylik.
7. **06:00 qorovulsiz run ekran qulflanmagan sessiya talab qiladi** (osascript/SendInput qulflangan ekranga yozolmaydi).
   M8d asosiy rejim: "buxgalter kompyuterni ochganda catch-up", 06:00 — best effort? ⚠️ Sir bilishi shart.
8. Didox header'da firma almashtirgich bor (`related_companies`) — bitta login bir nechta firmaga kira olsa, login soni kamayadi.
   Hozircha har firma alohida login (Sir modeli); optimallash keyin — reviewer fikri.
9. Precheck har faktura uchun `partner=` ro'yxatini ochadi (+1 navigatsiya) — qabul qilinadimi, yoki firma boshida bir marta?
10. macOS: lotin bo'lmagan klaviatura tartibida run'ni **bloklash** — qattiqmi?

---
## v2 — plan-reviewer o'zgarishlari (2026-10-12, Sonnet; Fable qarorlari)
Reviewer: **APPROVE_WITH_CHANGES** ([M8-REVIEW.md](M8-REVIEW.md)). M8a boshlanishi mumkin; M8b/M8c/M8d quyidagilar
rejaga kirgach. Hammasi qabul qilindi, `didox_runs` bo'yicha reviewer varianti tanlandi.

**B1 — precheck toraytirildi (jim xato: 31 kunlik oylar tiyinigacha bir xil summa beradi).**
- Precheck **umumiy "Didox'da bormi"** emas — faqat **shu ilova boshlagan** saqlashni tiklaydi: `saving` yozuvi bor faktura uchun,
  `partner=<STIR>` ro'yxatida STIR + shartnoma № (**aniq tenglik**) + summa (**tiyin BigInt**) mos va UUIDv1 ichidagi vaqt
  `saveClickedAt − 2 daq … now` oynasida bo'lgan **aynan bitta** `--white` qator → ID. 0 yoki ≥2 → `SAVED_ID_UNKNOWN`.
- Ilovadan tashqarida (qo'lda) yaratilgan qoralama avto-moslanmaydi: shunga o'xshash qator bo'lsa → **to'xtash** "Didox'da o'xshash
  qoralama bor — tekshirib 'Belgilash' bosing" (§15 taxmin yo'q). 12-qadam ham shu qoida bilan.
- Fake-page testi: ikki oy, bir shartnoma, bir xil summa → noto'g'ri ID olinmaydi.

**B2 — dublikat spirali yopildi.**
- **Write-ahead:** "Сақлаб қолиш"dan oldin run yozuviga `{contractId, state:'saving', at}` (diskka, kutiladi). Qayta ochilganda
  `saving` qolgan faktura = **karantin** (`needs_check`): avto-qayta urinish **yo'q** (07:00/08:00 da ham, "hammasi"da ham);
  UI: "Saqlangan bo'lishi mumkin — Didox Қоралама'sini tekshiring" + "Belgilash" / "Karantindan chiqarish".
- ID ma'lum, PUT yiqilsa → 3 marta backoff retry → `userData/pending-marks.json` → keyingi startda qayta yuboriladi. ID yo'qolmaydi.
- `RACE_ALREADY_MARKED`: API `PUT …/draft {didoxDocumentId, source:'didox'}` mavjud **ID'siz qo'lda belgi** ustiga `confirmWarnings`siz
  ID biriktirishga ruxsat beradi (faqat `didoxDocumentId IS NULL` bo'lsa); aks holda 409 + UI "Dublikat bo'lishi mumkin: ID …".
- Saqlashdan keyingi qidiruv: 10–15 s ichida 3–4 reload, keyin `SAVED_ID_UNKNOWN`. `cancel()`: `saving` ichida bekor = saqlash
  tugashini kutish + ID qidirish; ID topilmasa karantin.

**B3 — parol noto'g'ri oynaga tushmasligi (§13).**
- Autotype `keystroke`dan oldin: macOS — frontmost jarayon `E-IMZO` **va** `AXFocusedUIElement` parol maydoni (`AXSecureTextField`)
  ekani tekshiriladi, bo'lmasa yozilmaydi (`EIMZO_DIALOG_MISSING`); Windows — foreground oyna PID = E-IMZO jarayoni + sarlavha.
  Yozishdan oldin Didox sahifasida `document.activeElement.blur()`.
- "Yozildi" tasdig'i: E-IMZO oynasi **yopilishi** (12 s poll), 3 s emas. Oyna qolsa → bir marta Escape → `needs_attention`.
- Skript matni `osascript -l JavaScript -e <matn>` argv'da (asar ichidan fayl o'qish muammosi yo'q), parol **stdin**da. Windows'da
  PowerShell `-Command` + stdin. electron-builder `files`: `dist/**` + `src/**/*.{html,cjs}` (tsc chiqarmaydigan aktivlar).
- E-IMZO klienti **faqat** `{name:'version'}` va `{plugin:'pfx',name:'list_all_certificates'}` yubora oladi (allow-list, test bilan).
- UAC/elevated E-IMZO: Windows spike'ida tekshiriladi.

**B4 — Electron oynasida real Didox ERI login spike (M8b kodidan oldin, Sir bilan, kodsiz vaqtinchalik skript):** partition, UA,
`wss://127.0.0.1:64443` sertifikat ishonchi, kalit menyusi, "Кириш" → E-IMZO oynasi, to'g'ri va noto'g'ri parol xulqi (M2).

**M1 — qorovulsiz 06:00 va'dasi rostlanadi** (✅ Sir, 2026-10-12: "shartli 06:00 + bildirishnoma"): SRS "09:00 gacha tayyor" olib tashlanadi. FR-8.10: ilova
**shartlar bajarilganda** ishlaydi — ekran qulflanmagan, foydalanuvchi ≥2 daq idle (fokus o'g'irlamaslik), E-IMZO ishlayapti, kalit
tashuvchi ulangan, Accessibility ruxsati bor (`isTrustedAccessibilityClient(false)` preflight). Shartlar bajarilmasa — **bildirishnoma**
("Didox qoralamalari kutmoqda — ishga tushirish") + ilova ochilganda/uyg'onganda/qulf ochilganda catch-up. 06:00 — shartli.
Windows'da `window-all-closed` → quit o'zgaradi (tray rejimi). `safeStorage.decryptString` xatosi → "parol yo'q, qayta kiriting".

**M2 — `LOGIN_FAILED` ham `needs_attention`** (markRejected bilan bir xil ta'sir): har qanday "yozildi, lekin kirmadi" → faqat inson
ochadi (parolni qayta kiritish yoki "tekshirildi" belgisi). M8d shu holatdagi firmaga tegmaydi.

**M3 — `startsWith(baseUrl)` → `new URL(u).origin === appOrigin`** (IPC guard **va** mavjud `will-navigate`; userinfo hiylasi
`http://127.0.0.1:PORT@evil.com` yopiladi). IPC argumentlari validatsiya (tin `/^\d{9}$/`, month, uuid, lenderIds ≤ 200).

**M4 — lifecycle:** `ensureApi()` idempotent; `activate` ikkinchi API child yaratmaydi; API child yiqilsa `API_DOWN` (run to'xtaydi,
UI xabar), startup'dan keyin ham kuzatiladi.

**M5 — ro'yxat/summa:** `limit=100`; qator soni == limit → **fail-closed** `LIST_TRUNCATED`; summa taqqoslash tiyin BigInt parser
bilan (Didox formati spike'da aniqlanadi; kutilmagan format → to'xtash); shartnoma № + sana katagi uchun aniq parser.

**M6 — API `PUT …/draft`:** `expectedAmount` (tiyinigacha; farq → 409 `AMOUNT_CHANGED`, belgilanmaydi), `didoxDocumentId`
`/^[0-9A-F]{32}$/i`, `source`. Run 30–90 daqiqa davom etadi — summa o'zgarsa Didox va DB ajramaydi.

**M7 — Didox oynasi:** partition `didox` (in-memory, `persist:` emas — baribir tozalanadi); `setPermissionRequestHandler` → hammasi
rad; `webRequest` host allow-list (`didox.uz`, `*.didox.uz`, `127.0.0.1:64443/64646`); spike'da kuzatilgan imzolash/yuborish
endpoint'lari (`…/sign`, `…/send`, `tosign` …) **tarmoq darajasida to'siladi** (chaqirish emas, to'sish — §14 ga mos);
`setIgnoreMouseEvents` o'rniga `win.setEnabled(false)` (foydalanuvchi kiritishi bloklanadi, `sendInputEvent` ishlaydi — spike'da
tasdiqlanadi). Screenshot'lar: firma rekvizitlari ko'rinadi (F.I.Sh. direktor) — faqat lokal, 7 kun/20 ta rotatsiya.

**M8 — testlar:** fake-page testlari qadam mantig'ini (tarmoqlar, xato kodlari, taqiq) isbotlaydi, locator snippet'larini emas →
jsdom fixture faqat **drift detektori** (Didox build o'zgarsa qizil). Real-Didox spike ro'yxati (M8c kodidan oldin, 1 sessiya):
(1) Electron'da login + to'g'ri/noto'g'ri parol; (2) yozish usuli — sana niqobi, STIR, MXIK, Нарҳ 3 summada `1.00`, `552328.77`,
`15904000000.10` + o'qish formati; (3) "Хизмат кўрсатиш" matni va MUI select usuli; (4) saqlashdan keyingi ro'yxat eskirishi,
tartibi, `limit` chegarasi, pagination; (5) ikkinchi `/create_document` bo'shmi, `clearStorageData`dan keyin login so'raladimi;
(6) imzolash/yuborish endpoint nomlari (faqat Network kuzatuvi); (7) **Windows**: E-IMZO oynasi/jarayoni, UAC, foreground, `SendInput`.

**M9 — Windows:** autotype Windows spike'i M8d'dan **M8b ga** suriladi; M8b/M8c acceptance "macOS'da tasdiqlangan, Windows gate
ochiq" deb yoziladi. ✅ Sir (2026-10-12): Windows PC **M8c dan keyin** → Windows spike va gate M8d da qoladi; M8b/M8c macOS'da "Windows tasdiqlanmagan" belgisi bilan qabul qilinadi.

**`didox_runs` — API'da emas, v1 da `userData/didox-runs/<runId>.json`** (write-ahead yozuvlar shu faylda; main yagona yozuvchi;
web `didox:list-runs` IPC orqali o'qiydi; M8d catch-up shu fayllardan "oy bajarilganmi"ni biladi). API o'zgarishi faqat
`invoice_drafts.source` + `expectedAmount` + ID biriktirish qoidasi (B2). Jadval kerak bo'lsa keyin ko'chiriladi.

**Boshqa:** service JWT yetarli, API e2e'ga `alg`/sir rad testlari; Qaror A (TS) — alohida mexanik commit; E-IMZO porti **64646**
(`ws://`, TLS yo'q); bir nechta kalit → `validTo` eng uzog'i, UI'da seriya ko'rinadi; firma almashtirgich v1 da yo'q; lotin
bo'lmagan tartibda bloklash qoladi; Electron 34 EOL — M8d'da yangilash baholanadi.

### Qurish tartibi (yangilangan)
M8a (SRS + TS skelet + kalit/parol) → **B4 spike** (Electron'da login, Sir bilan) → M8b (macOS) →
**M8c spike ro'yxati** (7 band) → M8c → M8d.
