# M8 — Didox: barcha hujjatlar bitta faylda

> 2026-10-12 holatiga. Manba fayllar repo'da; bu fayl ulardan nusxa. Tartib: reja → review → SRS → Didox xaritasi → E-IMZO tadqiqoti → PROGRESS.


---

<!-- ===== Manba: docs/plans/M8-didox-drafts.md ===== -->

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


---

<!-- ===== Manba: docs/plans/M8-REVIEW.md ===== -->

# Review: M8 — Didox avtomatik qoralamalar (yo'l B) — 2026-10-12

Verdict: APPROVE_WITH_CHANGES

Yo'nalish to'g'ri: web-DOM-drayver Electron main'da, API Didox'ni bilmaydi, "page" abstraksiyasi, inson tezligi,
firma-stop semantikasi, parol hech qachon IPC orqali qaytmaydi, summa API'dan olinadi (renderer yubormaydi).
Lekin reja hozirgi shaklida (a) **ikki xil jim yo'qotish/dublikat yo'li** (precheck false-positive, SAVED_ID_UNKNOWN →
qayta urinish), (b) CONSTITUTION §13 ni buzadigan **"parol noto'g'ri oynaga yoziladi"** yo'li, (c) butun M8b
asosi — "Didox ERI login Electron oynasida ishlaydi" — hali birorta joyda tekshirilmagan, (d) SRS va'dasi
("09:00 gacha tayyor") ni bajara olmaydi. **M8a (SRS + kalit/parol qatlami) boshlanishi mumkin; M8b/M8c/M8d — blocker'lar
yopilmaguncha yo'q.**

Tekshirilgan kod: `apps/desktop/{package.json,electron-builder.yml,src/main.js,src/config.js,src/setup-preload.js,src/setup.html,scripts/prepare-resources.mjs}`,
`apps/api/src/{auth/*,invoices/*,config/env.ts,prisma/{prisma.service,migrations}.ts,server-entry.ts,app.setup.ts}`,
`apps/api/prisma/{schema.prisma,migrations/20261007154304*,…154309*}`, `apps/api/test/helpers.ts`,
`apps/web/src/{features/invoices/InvoicesPage.tsx,features/companies/CompaniesPage.tsx,test/setup.ts,test/utils.tsx}`;
o'rnatilgan Electron 34.5.8 da `process.versions` o'zim ishga tushirdim.

---

## Blocker

### B1. Precheck false-positive: bir xil shartnoma № + bir xil summa, boshqa oy → faktura jim o'tkazib yuboriladi
- Plan 0-qadam: `.doc-status--white` qatorda **shartnoma № + ҚҚСсиз summa** mos bo'lsa → `already`. Ro'yxatda **oy yo'q**
  (ustunlar: [6] shartnoma № va sana — bu *shartnoma* sanasi, [7] summa; hujjat № va sanasi bo'sh — §9.1).
- Foiz summasi kunma-kun (CR-2, 365 kunlik asos) hisoblanadi: qoldiq va stavka o'zgarmasa yanvar, mart, may, iyul, avgust,
  oktyabr, dekabr (hammasi 31 kun) **tiyinigacha bir xil**. Bu yer yuzidagi oddiy holat (qoldiq o'zgarmagan shartnoma).
  Natija: mart fakturasi uchun precheck yanvar qoralamasini topadi → `already`, **yanvar ID'si mart qatoriga yoziladi**,
  mart uchun Didox'da hech narsa yaratilmaydi. Ilova "bajarildi" deydi, buxgalter esa yo'q qoralamani kutadi — eng yomon xato turi (jim).
- Xuddi shu 12-qadamda: "eng yangi mos `--white` qator" — saqlashdan keyin ro'yxat eskirgan bo'lishi mumkin (didox-flow §2a:
  "ro'yxat bo'sh qoldi — qayta yuklash kerak bo'ldi"), shunda "eng yangi mos" = o'tgan oy qoralamasi → yana noto'g'ri ID.
- Nima qilish kerak:
  1. Precheck'ni **umumiy "Didox'da bor-yo'q" tekshiruvidan "ilovaning o'z ishini tiklash" ga toraytiring**: faqat run'ning o'zi
     boshlagan (`saving` yozuvi bor) faktura uchun, va faqat UUIDv1 vaqti (`time_low/mid/hi` 32-hex ichida) `saveClickedAt − tolerance`
     dan keyin bo'lgan qator. Didox server soati bilan farq uchun tolerance (±2 daq) va ID vaqti `now` dan oldin emasligini tekshiring.
  2. Ilovadan tashqarida (buxgalter qo'lda) yaratilgan qoralamani avto-moslash **qilmang**: oy belgisi ro'yxatda yo'q; moslash
     uchun qoralamani ochib izohni o'qish kerak (to'g'ridan-to'g'ri URL ishlamaydi — didox-flow §2a). Bunday holat: "Didox'da shunga
     o'xshash qoralama bor — tekshirib 'Belgilash' bosing" deb **to'xtash** (§15: taxmin yo'q).
  3. 12-qadam: ID'ni faqat (a) STIR + shartnoma № (aniq tenglik, `includes` emas — "1" ⊂ "10") + summa (tiyin BigInt) + (b) ID vaqti
     oynasi + (c) aynan bitta mos qator bo'lsa oling; 0 yoki ≥2 → `SAVED_ID_UNKNOWN` (B2).
  4. Fake-page testlariga aynan shu stsenariy: ikki oy, bir xil summa, bir xil shartnoma.

### B2. `SAVED_ID_UNKNOWN` → "keyingi urinishda tekshiriladi" dublikat spirali yaratadi
- `SAVED_ID_UNKNOWN` sababi — qidiruv (list/selector/pagination/eskirgan ro'yxat) ID'ni topolmadi. Keyingi urinishdagi precheck **xuddi
  shu qidiruv** — u ham topolmaydi → forma qayta to'ldirilib yangi qoralama saqlanadi. M8d da 07:00 va 08:00 qayta urinishlar bilan
  bitta fakturadan 3 ta qoralama chiqishi mumkin; hammasi unattended.
- Xuddi shu yo'l: `cancel()`/`before-quit` "Сақлаб қолиш" bosilgandan keyin, ID yozilgunga qadar; API'ga PUT tarmoq xatosi (child
  API yiqilgan: `main.js:48` `api.on('exit')` faqat startup'da `fail` qiladi, keyin jim); `RACE_ALREADY_MARKED` (buxgalter shu payt
  "Belgilash" bosgan — Didox'da qoralama bor, ilovada ID'siz qo'lda belgi, ikkinchi qoralama yaratilishi ehtimoli).
- Nima qilish kerak:
  1. **Write-ahead intent:** "Сақлаб қолиш"dan *oldin* `didox_runs.items[i] = {state:'saving', at}` (PATCH, kutiladi). Run qayta
     ochilganda `saving` qolgan faktura = **karantin** (`needs_check`): avto-qayta urinish YO'Q (na 07:00/08:00 da, na qo'lda "hammasi"da);
     UI: "Saqlangan bo'lishi mumkin — Didox Қоралама'sini tekshiring" + "Belgilash"/"Karantindan chiqarish".
  2. `PUT` muvaffaqiyatsiz bo'lsa — ID ma'lum, **PUT'ni qayta urining** (idempotent, 3 marta backoff), keyin `userData/pending-marks.json`
     ga yozing va keyingi startda qayta yuboring. ID'ni yo'qotmang.
  3. `RACE_ALREADY_MARKED`: API'ga "ID bo'sh qo'lda belgi ustiga Didox ID yozish" (`source:'didox'` + mavjud yozuv `didoxDocumentId=null`)
     ruxsat bering; aks holda UI'da "Dublikat bo'lishi mumkin: ID …" ogohlantirishi.
  4. Saqlashdan keyingi qidiruv: bitta reload emas — 10–15 s ichida 3–4 marta reload (eventual consistency), faqat shundan keyin
     `SAVED_ID_UNKNOWN`.
  5. `cancel()` ta'rifi ziddiyatli ("waitFor erta chiqadi, forma tashlanadi" vs "qadam tugaydi"): `saving` ichida bekor qilish =
     qadamni tugatib ID'ni topish (≤ timeout) yoki karantin; "forma tashlanadi" faqat `save` bosilmagan holatda.

### B3. CONSTITUTION §13: parol noto'g'ri oynaga yozilishi mumkin (autotype fokus/oyna identifikatsiyasi)
- macOS skript: "`processes['E-IMZO'].windows.length>0`" → `setFrontmost` → `keystroke(pw)`. Faqat "oyna soni > 0" tekshiriladi:
  E-IMZO menyu-bar ilovasi (yashil ikonka) — foydalanuvchi ochgan "Haqida/Sozlamalar", yangilanish yoki xato oynasi ham `windows.length>0`.
  `setFrontmost` va `keystroke` orasida fokus o'g'irlansa (bildirishnoma, Slack, Terminal) — parol o'sha ilovaga yoziladi.
- Windows: "E-IMZO oynasi `javaw`/E-IMZO jarayoni bo'yicha" — `javaw` umumiy (har qanday Java ilova, masalan 1C/boshqa).
  `SendInput` **foreground** oynaga boradi; Windows foreground-lock tufayli E-IMZO oynasi fokus olmasligi mumkin, fokus esa Electron/Didox
  oynasida qoladi → parol **Didox sahifasidagi fokuslangan input'ga** yoziladi (uchinchi tomon JS o'qiy oladi, diagnostika screenshot'ida ochiq
  matn bo'lib qoladi). Bu §13 ("parol faqat E-IMZO'ning o'z oynasida") ning to'g'ridan-to'g'ri buzilishi.
- Spike qamrovi: yashil spike **AppleScript + Keychain** edi (didox-flow §1b). Reja esa **JXA + stdin** ni ishlatadi — bu yo'l (stdin'dan
  `NSFileHandle` bilan o'qish, `-l JavaScript`, TCC attribusiyasi Electron bolasi sifatida) hali bir marta ham ishlatilmagan.
- Nima qilish kerak:
  1. `keystroke` dan **bevosita oldin** tekshiruv: macOS — frontmost jarayon nomi `E-IMZO` **va** oynada secure-text-field (`AXSecureTextField`)
     yoki kutilgan sarlavha; Windows — `GetForegroundWindow` → PID → jarayon yo'li E-IMZO o'rnatilgan papkaga mos + sarlavha. Mos kelmasa:
     **yozmaslik**, `AUTOTYPE_WRONG_WINDOW`, parol xotiradan tozalanadi.
  2. Arm qilishdan oldin Didox sahifasida `document.activeElement.blur()` va webContents fokusdan olinadi (ikkinchi qavat).
  3. Windows uchun UAC/UIPI: E-IMZO administrator sifatida ishga tushgan bo'lsa, oddiy jarayon `SendInput` yubora olmaydi (jim muvaffaqiyatsiz).
     Spike'da E-IMZO'ni oddiy va elevated rejimda sinang; "yozildi" ni faqat E-IMZO oynasi yopilishi bilan tasdiqlang.
  4. JXA/PS1 skriptini **fayl emas, argv matni** sifatida bering (`osascript -l JavaScript -e <kod>`; parol stdin'da). Sabab: electron-builder
     `asar: true` — `osascript`/`powershell` `app.asar` ichidagi faylni o'qiy olmaydi (asarUnpack'da faqat `**/*.node`), shuningdek
     rejadagi `files: dist/**` `.jxa.js`/`.ps1`/`preload.cjs`/`setup.html` ni tsc chiqarmaganligi uchun o'ramga umuman olmaydi.
  5. E-IMZO WebSocket klienti **yo'l-qo'yilgan xabarlar ro'yxati** bilan cheklansin (`version`, `pfx.list_all_certificates`); `load_key`/`create_pkcs7`
     kodda umuman yo'q bo'lsin (§13 "chaqirmaydi" ni test bilan majburlash). `alias` xom satri log/xatoda hech qachon chiqmasin.

### B4. Markaziy taxmin tekshirilmagan: Didox ERI login **Electron BrowserWindow** ichida ishlaydi
- Barcha "tekshirilgan faktlar" (kalit ro'yxati DOM'i, forma, E-IMZO bilan gaplashish) **Sir'ning Chrome'ida** olingan (didox-flow sarlavhasi).
  Electron 34 (Chromium 132.0.6834, men tasdiqladim) oynasida real Didox login hech qachon bajarilmagan. M9-REVIEW "Nice-to-know" shuni
  aytgan edi; PROGRESS'da yopilganiga yozuv yo'q. Xavflar: (a) Didox UA'da `Electron/…` ni rad etishi / bot-himoya; (b) `wss://127.0.0.1:64443`
  sertifikati — Chrome'da Sir E-IMZO root'ini "Always Trust" qilgan bo'lishi mumkin (e-imzo.md §6.1), Electron OS do'konidan oladi, lekin macOS
  Keychain trust sozlamasi brauzerga xosdir; (c) Didox sahifasi Origin `https://didox.uz`dan 64443 ga chiqadi — E-IMZO domen kaliti ishlaydi
  (Chrome'da ishlagan), lekin Electron'da UA/headers farqi; (d) `sendInputEvent` vs React controlled input.
- Nima qilish kerak: **M8b kodidan oldin 1–2 soatlik spike** (kodsiz, `apps/desktop` da vaqtinchalik skript): `persist`siz partition bilan
  Didox'ni oching → kalit ro'yxati chiqadimi → "Кириш" → E-IMZO oynasi (parol qo'lda) → kirdimi. "Yo'q" bo'lsa — `certificate-error`,
  `userAgent` o'zgartirish, yoki butun yo'l qayta ko'riladi. M8a bunga bog'liq emas; M8b/M8c bog'liq.

---

## Major

### M1. Qorovulsiz 06:00 SRS va'dasini bajarmaydi — rejada halol aytilmagan (savol 7 ga javob: ha, "best effort" ham emas)
- Qulflangan ekran (macOS `loginwindow`, Windows secure desktop) — System Events `keystroke` ham, `SendInput` ham bormaydi. Uyqu rejimida
  `setTimeout`/cron yurmaydi; 08:30 da uyg'onganda `powerMonitor.resume` catch-up **qulflangan sessiyada** ishga tushadi → autotype ishlamaydi,
  E-IMZO oynasi osilib qoladi. E-IMZO ishga tushmagan bo'lishi (Java ilova, avto-start yo'q), kalit tashuvchi (USB/ID) ulanmagan bo'lishi,
  ilovaning o'zi ishlamayotgani (Windows'da `window-all-closed` → `app.quit()`, `main.js:106` — tray rejada, lekin yopish xulqi o'zgartirilishi
  aytilmagan) — hammasi 06:00 ni yo'qqa chiqaradi.
- SRS FR-8.3 "09:00 gacha tayyor" mavjud va e-imzo.md §7 (TL;DR 6) "qorovulsiz amalda mumkin emas" degan. Reja FR-8.10 da "09:00"ni jim tashlab
  ketgan. Sir Q7 ni bilishi shart deb o'zi yozgan — bu yetarli emas: SRS matni aniq **o'zgartirilishi** va PROGRESS'ga yozilishi kerak.
- Qo'shimcha xavf — catch-up foydalanuvchi ishlayotgan paytda: ilova ochilganda avtomatik run `setFrontmost` / `SendInput` bilan fokusni
  oladi; buxgalter shu vaqtda Excel'da yozayotgan bo'lsa — parol (B3) yoki klavishlar noto'g'ri joyga.
- Nima qilish kerak: (1) Avtomatik ishga tushirish **faqat**: ekran qulflanmagan (`powerMonitor` `lock-screen`/`unlock-screen`,
  `getSystemIdleState`), E-IMZO ulanadi, kalit bor — shartlar bajarilsa *bildirishnoma* "Didox qoralamalari tayyor — boshlash?" (bir bosish) —
  `idle` bo'lsagina to'liq avtonom. (2) Preflight: macOS `systemPreferences.isTrustedAccessibilityClient(false)` har run boshida
  (reja faqat birinchi marta `true` bilan so'raydi); ad-hoc imzoli (`mac.identity: null`) har qayta qurish/yangilanishdan keyin TCC yozuvi
  yaroqsizlanadi — run Didox ochilmasdan "Accessibility ruxsatini qayta bering" deb to'xtasin. Xuddi shu sababli `safeStorage` kaliti
  (Keychain, imzoga bog'liq) o'qilmay qolishi mumkin: `decryptString` xatosi = "parol yo'q" holati (rejada faqat "buzuq JSON" bor).
  (3) SRS FR-8.3/8.10 matnini rostga: "oy 1-kuni 06:00 da kompyuter ochiq va ekran qulflanmagan bo'lsa avtomatik; aks holda buxgalter
  kompyuterni ochganda ilova taklif qiladi". (4) 07:00/08:00 qayta urinish va "09:00" va'dasi SRS'dan olib tashlansin.
- Vaqt zonasi: Asia/Tashkent'da DST yo'q — xavf past; lekin PC soatining noto'g'riligi (E-IMZO timestamp ham) preflight'da ogohlantirilsin. Minor.

### M2. Noto'g'ri parolni aniqlash va "qayta urinish yo'q" kafolati (savol 1 ga javob: yetarli emas)
- `rejected` signali: "oyna Return'dan 3 s keyin hali ochiq". Ikkala yo'nalishda xato: (a) muvaffaqiyatda E-IMZO oynasi PFX ochish + Java
  ishga tushishi bilan 3 s dan uzoqroq turishi mumkin (sekin PC) → **yolg'on `WRONG_PASSWORD`** → Escape (haqiqiy kirishni bekor qiladi) +
  `markRejected` → firma qo'lda parol qayta kiritilguncha bloklanadi; (b) noto'g'ri parolda E-IMZO oynani yopib xato Didox'ga qaytarishi
  mumkin (e-imzo-init.js: `BadPaddingException` Didox'ga xato sifatida boradi — e-imzo.md §3.2) → oyna signali umuman bo'lmaydi, faqat 45 s `LOGIN_FAILED`.
- `LOGIN_FAILED` da `markRejected` yo'q → M8d 07:00/08:00 yoki keyingi catch-up xuddi shu parol bilan **yana yozadi** — §15 "login xatosida
  avtomatik qayta urinish yo'q" ning buzilishi (Didox parol-login kabi bloklamasa ham, qoida qoida).
- Nima qilish kerak: (1) har qanday "yozildi, lekin kirmadi" natijasi (`rejected` yoki `LOGIN_FAILED` yoki `EIMZO_DIALOG_MISSING`dan keyin yozilgan)
  firmaga `needs_attention` qo'yadi: **faqat inson harakati** (qo'lda "Kirishni tekshirish" yoki parolni qayta kiritish) uni ochadi; jadval/catch-up uni
  hech qachon urinmaydi. (2) 3 s o'rniga: oyna-yopilishi *yoki* Didox URL o'zgarishi — qaysi biri oldin bo'lsa, 12 s gacha poll; Escape faqat
  oyna identifikatsiya qilingan (B3.1) va 12 s dan keyin ham ochiq bo'lsa. (3) Spike'da ikki stsenarini **ikkalasini** kuzating (to'g'ri va ataylab
  noto'g'ri parol): oyna holati, Didox xato matni, vaqtlar. Natija reja ostida qayd etilsin. Bir martalik Escape — bekor, qayta urinish emas:
  ruxsat, lekin faqat shu shartlar bilan.

### M3. IPC / navigatsiya himoyasi prefiks-solishtirish bilan aylanib o'tiladi (mavjud kodda ham bor)
- Reja: `senderFrame.url.startsWith(baseUrl)`. Mavjud `main.js:49` `will-navigate` ham shunday. Men tekshirdim:
  `'http://127.0.0.1:54321@evil.com/x'.startsWith('http://127.0.0.1:54321') === true`, `new URL(...).host === 'evil.com'` (userinfo hiylasi).
  Ilova oynasi tashqi sahifaga o'tsa (kichik ehtimol, lekin guard aynan shu holat uchun), preload `window.desktop` ni **har navigatsiyada** qayta
  ekspozitsiya qiladi → begona sahifa `didox.createDrafts`, `eri.removePassword`ni chaqira oladi.
- Nima qilish kerak: `new URL(url).origin === baseOrigin` (va `event.senderFrame === win.webContents.mainFrame`); `will-navigate`ni ham shunday tuzating;
  `tin` argumentlari `^\d{9}$`, `month` regex, `lenderIds` UUID tekshiruvi; `maxInvoices` production IPC yuzasidan olib tashlansin (faqat env bilan dev).

### M4. Ilova hayot sikli: ikkinchi API bola jarayoni → bitta PGlite katalogiga ikkita yozuvchi
- `main.js:105` `app.on('activate')` — macOS'da oyna yopilgan, jarayon tirik (`window-all-closed` darwin'da quit qilmaydi), Dock bosilsa `launchApp()` →
  **yangi** `startApi()` → ikkinchi `fork` bir xil `userData/db` bilan; birinchi bola `api = …` qayta yozilgani uchun `quit`da `kill` qilinmay qoladi.
  PGlite — bitta egasi (M9-REVIEW B1/M5). M8 da (tray, scheduler, fon rejimi) bu yo'l odatiy bo'lib qoladi.
- Reja `appWin` ni bitta deb faraz qiladi, lekin hayot siklini aniqlamaydi: oyna yopilishi ≠ chiqish; scheduler tirik tursa API ham tirik; qayta ochish
  mavjud `baseUrl`ni qayta ishlatadi; `before-quit` — `preventDefault` + async cancel + `app.exit()` (hozirgi `app.on('quit', …kill())` kutmaydi).
- Nima qilish kerak: M8a ning 0-qadamiga "lifecycle" qo'shing: `ensureApi()` (idempotent), `activate` faqat oynani qayta yaratadi,
  `window-all-closed` xulqi (tray bilan) aniq yoziladi, `api.on('exit')` mid-run da run'ni `API_DOWN` bilan to'xtatadi va foydalanuvchiga ko'rsatadi, test bilan.

### M5. Precheck/ro'yxat: pagination, limit, o'chirilganlar, summa formati
- `limit=20` (didox-flow §2a). O'chirilgan (`--red`) qoralamalar **abadiy** ro'yxatda qoladi, imzolangan hujjatlar boshqa tabda — bitta kontragent bilan bir necha
  shartnoma × oylar bo'yicha 20 dan oshishi real. Rejada pagination yo'q → tegishli qator 2-sahifada bo'lsa false-negative (dublikat, B1 ga ulanadi).
  Qilish: `limit=100` ni spike'da sinash; qator soni == limit bo'lsa **fail-closed** (`LIST_TRUNCATED`).
- Summa: "≥ 1 000 000": ro'yxatda va inputda mingliklar (bo'shliq/NBSP/yupqa bo'shliq yoki `,`). Rejaning "`,`→`.`" normalizatsiyasi `1,234.50` ni
  `1.234.50` qiladi (false stop — xavfsiz tomon, lekin run'ni yiqitadi) va `1,23` bilan `1,234` ni farqlay olmaydi. Qilish: spike'da Didox'ning aniq formatini
  (input ko'rinishi, list ko'rinishi, `.00` tushib qolishi) yozib, **bitta qat'iy parser** → **tiyin BigInt** (CONSTITUTION §7: `===` satr taqqoslash emas, Decimal/BigInt);
  format kutilganidan farq qilsa — to'xtash. Nuqta/vergul MUI input maskasi bilan char-by-char yozishda o'zini boshqacha tutishi mumkin (spike).
- Shartnoma № + sana bitta katakda: aniq parser; "№" prefiksi, bo'shliq, registr — spike'dan keyin.
- O'chirilgan va qayta yaratilgan: ilovadagi `invoice_drafts` yozuvi o'chirilgan Didox ID'ga ishora qilib qoladi (ilova yolg'on aytadi). v1 da qabul
  qilinadi, lekin UI'da "Didox'da tekshirish" havolasi yoki hech bo'lmasa PROGRESS'da ma'lum cheklov sifatida yozing.
- Bir run'da bir kontragentga ikki faktura (ikki shartnoma): ikkinchi precheck birinchi saqlangan qoralamani ko'radi (boshqa shartnoma № → mos kelmaydi, to'g'ri),
  lekin shartnoma № ichma-ich (`1` va `1/A`) bo'lsa `includes` xavfi — B1.3 (aniq tenglik).

### M6. Summa PUT paytida qayta hisoblanadi — Didox'da yozilgan summa bilan ilovada saqlangan summa farq qilishi mumkin
- `InvoicesService.markDraft` (`invoices.service.ts:73`): `amount: money(interest)` — **PUT vaqtidagi** foiz. Run 30–90 daqiqa davom etadi;
  buxgalter shu vaqt ichida operatsiya/stavka o'zgartirsa, Didox formasidagi summa (run boshidagi) ≠ DB'dagi `invoice_drafts.amount`.
  `amountChanged` bayrog'i keyin chiqadi, lekin ilova "yaratildi" deydi. Qilish: PUT'ga `expectedAmount` (yoki `If-Match` kabi) qo'shing; mos kelmasa
  409 `AMOUNT_CHANGED` — run buni "Didox'dagi qoralama eskirgan, tuzating" deb qayd etsin. Yoki run davomida ma'lumot o'zgartirish bloklansin (UI banner).
- `MarkDraftDto.didoxDocumentId` faqat `MaxLength(100)`: `source:'didox'` bo'lsa `^[0-9a-f]{32}$` majburlang (plan buni aytmaydi).
- Biznes: 1-kuni 06:00 da o'tgan oyning oxirgi operatsiyalari hali kiritilmagan bo'lishi mumkin → barcha qoralamalar `amountChanged`. Sir bilishi kerak (minor, lekin aniq yozing).

### M7. Didox oynasi izolyatsiyasi: bo'shliqlar
- `persist:didox` — **doimiy** partition: run oxirida (oxirgi firmadan keyin) `clearStorageData` aytilmagan; 360 daqiqalik Didox sessiyasi diskda qoladi
  (`userData/Partitions/didox`). Jimlik bo'yicha `partition:'didox'` (xotirada) ishlating; saqlash kerak emas, har firma baribir tozalanadi. Run tugaganda/xatoda ham tozalang.
- `setPermissionRequestHandler`/`setPermissionCheckHandler` (hammasini rad), `webRequest` orqali `didox.uz` va `*.didox.uz` dan tashqari so'rovlarni to'sish
  (oldingi `will-navigate` faqat navigatsiyani qamraydi, sub-resurs va XHR'ni emas) — rejada yo'q. `will-prevent-unload` ni preventDefault qilish — to'g'ri.
- **"Hech qachon imzolamaydi" qo'riqchisi faqat `page.click(text)` da.** `read`/`executeJavaScript` snippet'lari, `needsPointer` (koordinata bo'yicha
  `sendInputEvent`) va klaviatura `Enter` bu qo'riqchidan o'tmaydi. Ikkinchi, DOM-mustaqil qavat qo'shing: Didox session'ida `webRequest.onBeforeRequest` bilan
  imzolash/yuborish endpoint'larini (spike'da kuzatib, ro'yxat tuzing: `…/sign`, `…/send`, `tosign`) bloklash — bu Didox API'sini chaqirish emas (§14), faqat to'sish.
  Locator snippet'larida `.click()` faqat ro'yxatdagi nomlangan elementlarga; umumiy `click(selector)` taqiqlansin.
- `setIgnoreMouseEvents(true)`: oyna "click-through" bo'ladi — buxgalter bosgan klik **ostidagi** oynaga (ilova yoki Excel) tushadi. O'rniga Didox oynasini
  modal/`setEnabled(false)` (Windows) yoki to'liq oyna ustiga shaffof bloklovchi qatlam (macOS) bilan yoping. Klaviatura kiritishi (Didox oynasiga) ham bloklanishi kerak (`before-input-event` → preventDefault).
- Diagnostika screenshot'lari: Didox sarlavhasida foydalanuvchi F.I.Sh. ko'rinadi; "JShShIR hech qachon" pikselga nisbatan kafolatlanmaydi. FR-8.1 (shaxsiy maydonlar saqlanmaydi)
  bilan ziddiyat: screenshot'ni faqat forma hududi bilan cheklang yoki login sahifasi/sarlavhani qirqing; 20 ta rotatsiya + "Diagnostika papkasi" ochish tugmasi bor — sezgir deb hujjatlang.

### M8. Testlar nimani isbotlaydi (4-burchak) va qurishdan oldingi minimal real-Didox spike ro'yxati
**Fake `page` testlari isbotlaydi:** qadamlar ketma-ketligi, timeout/cancel/error-semantikasi, firma-stop, guard (taqiqlangan locator so'ralmaydi), summa normalizatsiyasi.
**Isbotlamaydi:** hech bir locator snippet'i real DOM'da ishlashini (barcha DOM bilimi `locators.ts` snippet satrlarida — fake `page` ularni *bajarmaydi*, nomlangan
natijani qaytaradi), React controlled input, MUI portal/menyu, autocomplete tarmoq kechikishi, yozish usuli, modal/toast raqobati. Eng mo'rt qatlam — aynan testsiz.
- jsdom fixture g'oyasi: realistik **faqat** locator-kontrakt sifatida (saqlangan, sanitarizatsiya qilingan DOM snapshot'da `querySelector`/label-matn → element topiladi).
  Drift detektori sifatida foydali (Didox build o'zgarganda spike snapshot'ni yangilash). Lekin jsdom'da layout yo'q (`offsetParent`, `getBoundingClientRect`, ko'rinuvchanlik),
  MUI menyusi faqat ochiq holat snapshot'ida; real firma ma'lumotini fixture'ga qo'ymang (repo'ga rekvizit yozilmaydi). "Test yashil" ≠ "Didox ishlaydi" — Acceptance'da faqat real gate hisoblansin.
- **M8c kodidan oldingi minimal spike ro'yxati** (1 sessiya, Sir bilan; hammasi avval M8b spike (B4) dan keyin):
  1. Electron oynasida login (B4) + to'g'ri va noto'g'ri parolda E-IMZO/Didox xulqi (M2).
  2. Yozish usuli: sana (niqob), kontragent STIR, MXIK autocomplete, Нарҳ — `sendInputEvent` vs `execCommand('insertText')` — **3 xil summada**: `1.00`, `552328.77`, `15904000000.10`; o'qish formati (input/Жами/list).
  3. "Хизмат кўрсатиш" aniq matni va MUI select tanlash usuli (JS click yetadimi, pointer kerakmi).
  4. Saqlashdan keyingi ro'yxat: eskirish davomiyligi, sortirovka tartibi, `limit` parametri chegarasi, pagination elementi, `partner=` ni o'chirilgan/imzolangan hujjatlar bilan xulqi.
  5. Ikkinchi `/create_document` ochilganda forma bo'shmi (qoldiq holat, draft-autosave, "Диққат!" qayta chiqadimi), `clearStorageData` keyin qayta login talab qilinadimi.
  6. Imzolash/yuborish tarmoq endpoint'lari nomi (M7 `webRequest` ro'yxati uchun) — faqat DevTools Network kuzatuvi, bosmasdan.
  7. Windows (production platforma!): E-IMZO oynasi sarlavhasi/jarayoni, UAC, foreground-lock, `SendInput`.

### M9. Production platforma — Windows; reja hamma tekshiruvni macOS'da yopadi
- M8b/M8c acceptance macOS'da; Windows adapteri M8d oxirida, "spike Windows'da qayta o'rganiladi" (didox-flow §1b), E-IMZO Windows'da Java/Swing va `javaw` — oyna
  tuzilishi noma'lum. M9-REVIEW B2 (Windows gate yo'q) takrorlanmoqda. Qilish: "Windows PC mavjudmi?" ni Sir'dan **hozir** so'rang (M9-REVIEW ochiq savol 1); yo'q bo'lsa M8 statusi
  "macOS-only, Windows tasdiqlanmagan" bo'lsin — "accepted" emas. Windows autotype spike'ini M8b ga (M8d ga emas) oldinga suring, chunki B3/M2 xavflari aynan shu yerda.

---

## Minor

- **N1. `didox_runs` (savol 4):** asosiy sabab ("qayta ishga tushganda tarix", "catch-up bu oy bajarilganmi") jadvalsiz ham hal bo'ladi: "bajarilganmi" = o'tgan oyda
  `draft===null` va kalit+parol bor fakturalar qolmadi (haqiqat manbai `invoice_drafts`); tarix + karantin (B2) + "bugun urinildi" belgisi — `userData/didox-state.json` (kichik, atomik
  yozuv). API'da 4 endpoint + migratsiya + e2e + `resetDb` ni o'zgartirish (quyida N2) = ortiqcha sirt. Agar baribir jadval qolsa: ma'lumot modeli **write-ahead** (B2.1) uchun kerak
  bo'lgani sababli `items` ni run-darajasidagi JSON emas, `didox_run_items` qatorlari sifatida (state, error_code) saqlang, `GET /:id` ni kesing, `trigger` (SQL kalit so'z yaqini) → `triggered_by`.
  Mening tavsiyam: **v1 da fayl**; jadval — agar Sir tarixni DB zaxirasida xohlasa. (Reviewer ochiq savol 4: API "run" tushunchasini bilishiga qarshilik yo'q, lekin zarurat ham yo'q.)
- **N2. `resetDb` ≠ `didox_runs`:** `TRUNCATE TABLE companies CASCADE` faqat `companies`dan FK bilan bog'langan jadvallarni tozalaydi; `didox_runs` da FK yo'q → testlar orasida
  qoladi. `resetDb` ga `didox_runs` qo'shilishi kerak (PGlite rejimida `TRUNCATE a, b CASCADE` ishlaydi); e2e unga tayanmasin.
  `invoice_drafts` ga `source` ustuni qo'shilishi: `NOT NULL DEFAULT 'manual'` mavjud qatorlarga to'g'ri tushadi, snapshot (M9a runner `onBeforeApply`) himoya qiladi — OK; CHECK nomi
  mavjud uslubga (`invoice_drafts_*`) mos.
- **N3. Savol 3 (service JWT):** yetarli. `auth.guard.ts` faqat imzo + `exp`ni tekshiradi (`sub` solishtirilmaydi), cookie nomi `session` (`session.ts:3`), `JwtModule` HS256 sukut — rejadagi 2-fakt to'g'ri.
  Alohida loopback header/guard shart emas (sir o'sha foydalanuvchi fayl tizimida `config.json` 0600 — xavf chegarasi o'zgarmaydi). E2e "tashqi HS256" testi yaxshi; unga `alg:none`/boshqa sir bilan imzolangan token **rad** testi qo'shing.
  Eslatma: `startApi` ichidagi `JWT_SECRET` env orqali bola jarayonga beriladi (same-user `ps e` ko'rinadi) — M9b da mavjud, o'zgartirish M8 doirasidan tashqari.
- **N4. Savol 5 (bir STIR — bir nechta amaldagi kalit → eng uzoq `validTo`):** maqbul, lekin *kalit tanlanganini sezdirmasdan* emas: UI'da qaysi seriya/`validTo` tanlangani ko'rinsin
  va `eri-store`da `serial` saqlangani uchun (reja shunday) tanlov o'zgarsa parol qayta so'ralsin (reja bu yerda to'g'ri). Direktor va buxgalter kaliti paroli *har xil* — noto'g'ri kalitga boshqa parol → `rejected` (M2).
- **N5. Savol 8 (header firma almashtirgichi / `related_companies`):** ERI kaliti juridik shaxsga (STIR) tegishli bo'lsa almashtirgich ishlamaydi (har firma alohida kalit — Sir modeli); jismoniy kalit bilan
  bo'lsa ishlaydi. v1 da qilmang (YAGNI + firma-izolyatsiya soddaligi). Hozirgi "har firma alohida login" to'g'ri.
- **N6. Savol 9 (precheck har faktura):** +1 navigatsiya (~3 s) arzon; muammo vaqt emas, to'g'rilik (B1). Firma boshida bitta umumiy ro'yxat saqlashdan keyin eskiradi, shuning uchun per-faktura qoldiring, lekin B1 shartlari bilan.
- **N7. Savol 10 (lotin bo'lmagan klaviatura tartibida bloklash):** qattiq emas, to'g'ri — noto'g'ri parol = `rejected` + qayta kiritish + (E-IMZO ba'zan hisoblagich) dan arzon. Faqat tekshiruv ishonchli bo'lsin
  (`TISCopyCurrentKeyboardInputSource` yoki `defaults read com.apple.HIToolbox`; JXA ichidan `keystroke` o'rniga `keyCode`+`key code` jadvali bilan ham aylanib o'tish mumkin, lekin ASCII-only parol cheklovi paydo bo'ladi — spike).
- **N8. Savol 2 (`sendInputEvent` vs `execCommand`):** spike'da hal qilish to'g'ri, lekin mezonni oldindan yozing: (a) React qiymatni qabul qildimi (read-back), (b) niqobli sana, (c) 16 xonali summa, (d) Electron oyna fokusda
  bo'lmasa ham ishlaydimi. `sendInputEvent` — fokus talab qiladi → foydalanuvchi boshqa oynaga o'tsa belgilar yo'qoladi/aralashadi (M7 bloklash bilan bog'liq).
- **N9. Savol 6 / Qaror A (TS):** CONSTITUTION "TypeScript strict" ~20 modul uchun asosli; lekin migratsiya **alohida mexanik commit** bo'lsin (main/config/setup-preload ko'chirish, hech qanday xulq o'zgarishisiz), M8a ning 0-qadami.
  Aniq tuzoqlar: (i) `files: dist/**` + tsc non-TS aktivlarni (`setup.html`, `preload.cjs`, skriptlar) chiqarmaydi → `copy` bosqichi; `package.json` `main` → `dist/main.js`; (ii) preload (sandbox) CJS bo'lishi shart — alohida `tsconfig` (`module: commonjs`) yoki qo'lda `.cjs`;
  (iii) `prepare-resources.mjs` `pnpm --filter desktop build` ni `electron-builder` dan oldin chaqirsin; (iv) `dev` = `tsc && electron .` har safar to'liq build → `tsc --watch` skripti qo'shing. JS+`checkJs` zaxirasi — qabul, agar (i)–(iv) vaqt olsa; lekin Sir qaror yozgan, TS tavsiya.
- **N10. Electron 34 (Chromium 132) — qo'llab-quvvatlash muddati o'tgan** (bugun 2026-10-12); M8 uchinchi tomon JS (didox.uz) yuklaydi. M9-REVIEW tadqiqotda 44 deb yozgan — repoda 34. Reja hisobotida tilga oling, M8d/NSIS dan oldin yangilash qaroriga qo'ying. Reja da'vosi "Electron 34 ichida Node 20, global `WebSocket` yo'q" — **to'g'ri**
  (men: `node 20.19.1`, `typeof WebSocket === 'undefined'`), `ws` kerak.
- **N11. `ws` + TLS:** 64443 uchun `rejectUnauthorized:false` (loopback, E-IMZO o'z root'i) yoki 64646 (`ws://`). Spike ikkalasi bilan ishladi; kod qaysi birini ishlatishini aniq yozing (tavsiya: 64646, TLS muammosi yo'q).
- **N12. Savol 7 qo'shimcha — E-IMZO ishga tushmagan/kalit tashuvchi ulanmagan** — `EIMZO_NOT_RUNNING` run'ni to'xtatadi (to'g'ri), lekin kalit tashuvchi ulanmagan firma `KEY_MISSING` bilan o'tkaziladi (to'g'ri) — UI xulosa aniq ajratsin.
- **N13. Hajm:** keskin kesish mumkin (v1): `DidoxRunsCard` (oxirgi 5 run), `didox:open-diagnostics` (papkani Finder'da ochish yetadi), "E-IMZO'dan yangilash" alohida tugmasi (sahifa ochilganda va fokusga qaytganda avtomatik), `GET /api/didox-runs/:id` (N1), `maxInvoices` IPC parametri.
- **N14. M8d bo'linishi:** "Jadval + tray + avtostart + Windows adapter" = 4 ish, ikki tur gate (macOS mantiq / Windows PC). Windows adapter (B3/M9) oldinga suriladi (M9), M8d = jadval + tray + lifecycle (M4). Tray ikonka va `setLoginItemSettings` foydalanuvchi roziligisiz yoqilmasin (M9-REVIEW M7).
- **N15. Gate 1 ("SINOV" izoh):** real firmalarda 552328.77 qoralamasi §9.1 qator nomidan farqli izoh bilan saqlanadi → qator nomi yo'li (§9.1 shabloni) oraliq gate'da tekshirilmay qoladi. Gate'da haqiqiy `lineName` bilan saqlab keyin o'chiring (qoralama baribir o'chiriladi).

---

## Tekshirilgan va yaxshi

- **Fakt 1:** Electron 34.5.8 → Node 20.19.1, global `WebSocket` yo'q — jonli tasdiqlandi. `ws` kerak.
- **Fakt 2:** cookie `session`, HS256 (`@nestjs/jwt` sukut), payload `{sub}`, `JWT_SECRET` — kodda (`session.ts`, `auth.guard.ts`, `auth.module.ts`) mos; guard `sub`ni solishtirmaydi, shuning uchun main imzolagan token qabul qilinadi.
- **Fakt 4:** `invoice_drafts.didox_document_id VARCHAR(100)` (migratsiya `…154304`), 32-hex sig'adi; `PUT …/draft` mavjud yozuvda `confirmWarnings`siz 409 (`invoices.service.ts:60-70`) — FR-8.5 server tomonda haqiqatan bepul.
- **Fakt 3 va 6:** app oynasida preload yo'q (`main.js:30-54`), `setup-preload.js` CJS (sandbox bilan ishlaydi); web testlarida `vi.stubGlobal` + `vi.unstubAllGlobals()` (`test/setup.ts:6`) → `window.desktop` stub bepul.
- `PrismaService`: migratsiya `onBeforeApply` snapshot bilan — `source` ustuni/`didox_runs` migratsiyasi uchun himoya mavjud (M9a). `source NOT NULL DEFAULT 'manual'` mavjud qatorlarni buzmaydi.
- Mavjud `invoiceRow`: `draft===null` filtri va `amountChanged` — M8 uchun yetarli asos; summa hech qachon renderer'dan kelmaydi (`GET /api/invoices` main'dan) — yaxshi.
- Parol oqimi dizayni (OS shifri, `withPassword` qamrovi, IPC faqat status qaytaradi, Linux `basic_text` rad, seriya o'zgarsa qayta so'rash, temp+rename, 0600) — to'g'ri; argv'da emas, stdin — to'g'ri fikr (B3.4 dagi fayl-masalasidan tashqari).
- Fail-stop semantikasi (selector yo'q/kutilmagan qiymat → firma to'xtaydi, screenshot, taxmin yo'q) §15 ga mos; `ForbiddenAction` ikkinchi qavat g'oyasi yaxshi (M7 da kengaytirish kerak).
- Katta qarorlar to'g'ri: `locators.ts`ga yagona DOM bilimi, `electron` importini 4 faylga cheklash, `maxInvoices:1` oraliq gate, M8a ni mustaqil foydali qatlam sifatida ajratish, SRS-avval tartibi.
- Faktura soni: `Tezlik 60–90 s/faktura` §15 bilan mos (parallel yo'q).

---

## Ochiq savollarga javoblar (qisqa)

1. Noto'g'ri parol signali: **yetarli emas** → M2 (identifikatsiyalangan oyna + 12 s poll, har qanday "yozildi-lekin-kirmadi" = `needs_attention`, faqat inson ochadi). Bir martalik Escape — ruxsat, M2 shartlari bilan.
2. Yozish usuli: spike'da hal qilish to'g'ri; mezonlar N8, 3 xil summa bilan.
3. Service JWT: yetarli (N3); `alg`/sir rad testi qo'shing.
4. `didox_runs`: API'ga qarshilik yo'q, lekin zarurat yo'q → v1 da `userData` JSON (N1); jadval qolsa — write-ahead qatorlari.
5. Eng uzoq `validTo`: ma'qul, UI'da tanlangan seriya ko'rinsin (N4).
6. Qaror A: TS — ha, alohida mexanik commit va build-aktiv tuzoqlari bilan (N9).
7. 06:00: best-effort ham emas, shartli — SRS "09:00" va'dasi olib tashlansin, bildirishnoma + qulf/idle shartlari (M1). Sir bilishi **majburiy**.
8. Firma almashtirgich: v1 da yo'q (N5).
9. Precheck per-faktura: qoladi, lekin B1 shartlari bilan (N6).
10. Lotin bo'lmagan tartibda bloklash: qattiq emas, to'g'ri (N7).

---

## Reja qurishdan oldin qabul qilishi shart bo'lgan o'zgarishlar (xulosa)

1. **B1:** precheck faqat run'ning o'z ishini tiklaydi + UUIDv1 vaqt oynasi + aniq tenglik + bitta mos qator; ikki-oy-bir-summa testi.
2. **B2:** write-ahead `saving` yozuvi, karantin (avto-qayta urinish yo'q), PUT retry + `pending-marks.json`, `RACE` uchun ID biriktirish yo'li.
3. **B3:** autotype'dan oldin oyna/fokus identifikatsiyasi (macOS secure-text-field, Windows foreground PID/sarlavha), Didox fokusini blur, skriptni argv'da; E-IMZO klienti xabarlar ro'yxati bilan cheklangan.
4. **B4:** Electron oynasida real Didox ERI login spike — M8b dan oldin (M8a ga bog'liq emas).
5. **M1:** SRS FR-8.3/8.10 ni rostga o'zgartirish; qulf/idle/Accessibility preflight; catch-up bildirishnoma orqali.
6. **M2:** `LOGIN_FAILED`/`rejected` → `needs_attention`; 3 s o'rniga identifikatsiyalangan oyna + poll.
7. **M3:** `new URL().origin` solishtirish (IPC va `will-navigate`), argumentlar validatsiyasi.
8. **M4:** lifecycle (idempotent `ensureApi`, `activate` ikkinchi bola yaratmaydi, `API_DOWN`).
9. **M5–M7:** pagination fail-closed, tiyin BigInt parser, `expectedAmount` PUT, in-memory partition + permission/webRequest cheklovlari + imzolash endpoint'larini to'sish, click-through o'rniga haqiqiy blok.
10. **M8/M9:** real-Didox spike ro'yxati (7 band) va Windows'ni M8b ga oldinga surish; Windows mavjudligi Sir'dan so'raladi.


---

<!-- ===== Manba: docs/SRS.md ===== -->

# SRS — Moliyaviy yordam: foiz hisobi

> Software Requirements Specification. Living document — qaror o'zgarsa avval shu yerni yangilang.
> Oxirgi yangilanish: 2026-10-12 · **Holat: Sir tomonidan tasdiqlangan (2026-10-07)**; Didox yo'li — **B: ilova Didox saytini o'z oynasida boshqaradi** (2026-10-12, M8 rejasi tasdiqlangan)

## 1. Maqsad (Goal)
Firmalar bir-biriga foizli moliyaviy yordam (qarz) beradi. Ilova har bir shartnoma bo'yicha
berilgan va qaytarilgan summalarni hisobga olib, **har oy uchun foiz summasini aniq hisoblaydi**,
qarz va foiz qoldig'ini ko'rsatadi, Excel hisobot beradi va Didox'da schyot-faktura qoralamasini
tayyorlaydi. Foydalanuvchilar — ikkala tomon (beruvchi va oluvchi) buxgalterlari.

## 2. Doira (Scope)
**Kiradi:**
- Firmalar ro'yxati (beruvchi ham, oluvchi ham bo'la oladi)
- Firmalar o'rtasidagi shartnomalar (ko'p beruvchi × ko'p oluvchi)
- Operatsiyalar: berildi / asosiy qarz qaytarildi / foiz to'landi (qo'lda kiritiladi)
- Foiz stavkasini o'zgartirish (tarix bilan)
- Oylik foiz hisoboti, qarz va foiz qoldig'i
- Excel eksport
- Didox'da schyot-faktura **qoralamasi** (imzolash — buxgalter qo'lida)
- Didox'da qoralamani **ilova o'zi** yaratadi: Didox saytini o'z oynasida ochib, firma ERI kaliti bilan avtomatik kiradi
  va formani to'ldiradi (yo'l B, Modul 8)
- Har buxgalter kompyuteriga lokal o'rnatiladigan desktop ilova (Electron + lokal baza, Modul 9)

**Kirmaydi (non-goals):**
- Penya / jarima foizi
- Murakkab (kapitallashgan) foiz
- Rollar, firma bo'yicha ko'rinish cheklovi — hamma hammasini ko'radi
- Oyni yopish / bloklash
- Bank ko'chirmasidan import, 1C integratsiya
- Ko'p valyuta (faqat UZS)
- Fakturani avtomatik imzolash / yuborish
- Didox'ning partner tokeni/maxfiy kalitini ilova kodiga olish yoki Didox API'sini to'g'ridan-to'g'ri chaqirish — **taqiqlangan**
  (CONSTITUTION §14); ilova faqat Didox sahifasi bilan, inson kabi ishlaydi
- Soliq bo'yicha qaror (MXIK kodi, QQS stavkasi buxgalter tomonidan beriladi)

## 3. Foydalanuvchilar / aktyorlar
- **Buxgalter** (beruvchi yoki oluvchi firmadan) — bitta umumiy login bilan kiradi, barcha
  ma'lumotni ko'radi va o'zgartiradi. Rollar yo'q.

## 4. Hisoblash qoidalari (yadro — barcha modullar shunga bo'ysunadi)

- **CR-1 Kunlik hisob (B qoidasi):** har kalendar kuni `D` uchun
  `foiz(D) = Qoldiq(D) × Stavka(D) / 100 / YilKunlari(D)`,
  bu yerda `Qoldiq(D)` — `D` kuni **oxiridagi** asosiy qarz qoldig'i:
  `Σ berildi (sana ≤ D) − Σ asosiy qarz qaytarildi (sana ≤ D)`.
  Ya'ni pul berilgan kun hisobga kiradi; qaytarilgan kun yangi (kamaygan) qoldiq bilan hisoblanadi.
- **CR-2 Yil kunlari:** `D` kalendar yiliga qarab 365 yoki 366 (actual/actual). 2026 va 2027 — 365.
- **CR-3 Oddiy foiz:** foiz faqat asosiy qarzga hisoblanadi; to'lanmagan foizga foiz hisoblanmaydi.
- **CR-4 Oylik foiz:** `Oy foizi = Σ foiz(D)` oy kunlari bo'yicha. Ichki hisobda **yaxlitlash yo'q**
  (aniq kasr: butun sonlar — tiyin × stavka × kun — bitta bo'lish). Hisobot, Excel va faktura uchun oy yakuni
  **2 xonagacha** (tiyin) yaxlitlanadi: **yarmi noldan uzoqqa** (0,5 tiyin → 1; −0,5 tiyin → −1).
- **CR-5 Stavka o'zgarishi:** buxgalter yangi stavkani `o'zgartirish sanasi` bilan kiritadi.
  - sana oyning **1-kuni** bo'lsa → shu kundan amal qiladi;
  - aks holda → **keyingi oyning 1-kunidan** amal qiladi.
  - Boshlang'ich stavka shartnoma boshlanish sanasidan amal qiladi.
  - Bir xil `amal qilish sanasi`ga bir nechta o'zgarish bo'lsa — oxirgi kiritilgani amal qiladi.
- **CR-6 Muddatdan keyin:** shartnoma muddati tugaganda asosiy qarz qolsa, foiz **amaldagi stavka
  bo'yicha hisoblanishda davom etadi**, qoldiq 0 bo'lguncha. Penya yo'q.
- **CR-7 Limit:** shartnoma summasi — **jami berilgan** summa chegarasi. Qaytarilgan summa limitni tiklamaydi.
- **CR-8 Foiz to'lovi:** faqat foiz qarzini kamaytiradi, foiz hisobiga ta'sir qilmaydi.
  `Foiz qarzi = Σ oy foizlari (yaxlitlangan) − Σ foiz to'lovlari`.
- **CR-9 Qayta hisob:** hisobot har doim operatsiyalardan qayta hisoblanadi (saqlangan "kesh" haqiqat
  manbai emas). O'tgan sanaga operatsiya kiritilsa yoki o'zgartirilsa — hisob avtomatik yangilanadi.

- **CR-11 Bugungacha:** barcha hisob (qoldiq, jamilar, oylik hisobot, foiz qarzi) `sana ≤ bugun` bo'lgan
  operatsiyalardan. Kelajak sanali operatsiya saqlanadi ("rejalashtirilgan"), sanasi kelganda hisobga kiradi.
  Boshlanishdan oldingi operatsiyalar qoldiqqa kiradi, foiz esa faqat boshlanish sanasidan (CR-5). Sir, 2026-10-07.
- **CR-10 Manfiy qoldiq:** asosiy qarz qoldig'idan ko'p qaytarilsa (ogohlantirish bilan saqlanadi),
  qoldiq **manfiy** bo'ladi va CR-1 formulasi o'zgarmasdan qo'llanadi — o'sha kunlar uchun foiz
  **manfiy** (beruvchi oluvchidan qarzdor). Sir qarori, 2026-10-07.

**Etalon misol (acceptance test):** shartnoma 2026-01-01, stavka 14%; 05.01 — 60 000 000 berildi;
20.01 — 15 000 000 asosiy qarz qaytarildi.
60 000 000 × 15 kun (5–19) + 45 000 000 × 12 kun (20–31) → **yanvar foizi = 552 328,77 so'm**
(aniq qiymat 201 600 000 / 365 = 552 328,767123…).

## 5. Funktsional talablar (modullar bo'yicha)

### Modul 1: Kirish va firmalar
- FR-1.1 — Bitta umumiy login/parol bilan kirish (credentials server konfiguratsiyasida, parol hash'langan).
- FR-1.2 — Firma qo'shish / tahrirlash / ro'yxat. Maydonlar (schyot-faktura rekvizitlari, §9.1):
  nomi, manzil, STIR (INN, 9 raqam), QQS to'lovchi registratsiya kodi (ixtiyoriy),
  hisob raqami (р/с, 20 raqam), MFO (5 raqam).
  Majburiy — faqat **nomi va STIR**; manzil, р/с, MFO keyin to'ldirilishi mumkin (odatda FR-1.3 importi
  bilan). To'ldirilmagan firma ro'yxatda "Rekvizitlar to'liq emas" belgisi bilan ko'rinadi (Sir, 2026-10-09).
  Didox ulanishi (faqat beruvchi firmalar uchun) — Modul 8 da qo'shiladi.
- FR-1.3 — **Didox faktura fayllaridan import:** buxgalter Didox'dan yuklab olingan schyot-faktura
  fayl(lar)ini (`.xls`, ichi HTML; §9.1 namunasi) tanlaydi → har fayldan **sotuvchi va xaridor**
  rekvizitlari olinadi (nomi, manzil, STIR, QQS kodi, р/с, MFO).
  - Bir yo'la bir nechta fayl (≤ 50 ta, har biri ≤ 1 MB).
  - Avval **ko'rib chiqish:** har firma uchun holat — `yangi` / `yangilanadi` (qaysi maydonlar) /
    `o'zgarishsiz` / `xato` (sababi). O'qib bo'lmagan fayl — alohida fayl xatosi.
  - Bir STIR bir nechta faylda bo'lsa — **faktura sanasi eng yangi** fayldagi rekvizitlar olinadi.
  - Buxgalter tasdiqlagach qo'llanadi: yangilar qo'shiladi, mavjudlar (STIR bo'yicha) yangilanadi,
    xatolilar o'tkazib yuboriladi. Qoidalar FR-1.2 bilan bir xil.
  - Yorliqlar: rus tilidagi Didox eksporti (namuna bilan tasdiqlangan) va o'zbek (kirill) varianti
    (Didox UI'dan olingan, haqiqiy fayl bilan **tekshirilmagan**).
- *Acceptance:* login'siz hech qaysi sahifa/API ochilmaydi; firma qo'shilib ro'yxatda ko'rinadi;
  namunaviy faktura fayli yuklanganda ikkala firma ko'rib chiqishda chiqadi va tasdiqdan keyin ro'yxatga tushadi.

### Modul 2: Shartnoma yaratish
- FR-2.1 — Shartnoma: raqami, sanasi, beruvchi firma, oluvchi firma, summa (limit),
  boshlanish va tugash sanasi, boshlang'ich yillik stavka (%). Boshlang'ich stavka stavkalar
  tarixining birinchi yozuvi bo'ladi va boshlanish sanasidan amal qiladi (CR-5).
- FR-2.2 — Beruvchi va oluvchi bir xil firma bo'lolmaydi. Tugash sanasi boshlanishdan keyin;
  limit > 0; 0 < stavka ≤ 100.
- FR-2.3 — Shartnomalar ro'yxati: №, sana, beruvchi → oluvchi, limit, muddat, joriy stavka.
  "Jami berilgan" va "asosiy qarz qoldig'i" ustunlari — Modul 3 da, "foiz qarzi" — Modul 4 da qo'shiladi.
- FR-2.4 — Shartnoma raqami **bir beruvchi–oluvchi juftligi ichida** takrorlanmaydi
  (boshqa juftlikda bir xil raqam mumkin).
- FR-2.5 — Tahrirlash: raqam, sana, limit, muddat. Tomonlar — shartnomada operatsiya bo'lmaguncha
  (Modul 3 bu cheklovni qo'shadi). Stavka bu yerda tahrirlanmaydi — faqat Modul 5 (tarix orqali).
- FR-2.6 — Shartnoma sahifasi (`/contracts/:id`): rekvizitlar, tomonlar, stavka; keyingi modullar
  (operatsiyalar, hisobot) shu sahifaga qo'shiladi.
- *Acceptance:* A→B, A→C, E→B shartnomalar yaratiladi va ro'yxatda ko'rinadi; etalon shartnoma
  (10 000 000 000, 14%, 01.01.2026–31.07.2027) to'g'ri saqlanadi va ko'rsatiladi.

### Modul 3: Operatsiyalar
- FR-3.1 — Operatsiya kiritish: sana, turi (`berildi` / `asosiy qarz qaytarildi` / `foiz to'landi`), summa (> 0), izoh.
- FR-3.2 — Operatsiyani tahrirlash va o'chirish (o'chirish — tasdiq bilan). Hisob har doim qayta hisoblanadi (CR-9).
- FR-3.3 — Ogohlantirishlar (**bloklamaydi**). "Saqlash" bosilganda forma ichida ko'rsatiladi; buxgalter
  **"Baribir saqlash"** bilan tasdiqlaydi. Ogohlantirish bo'lmasa — darhol saqlanadi:
  - jami berilgan > limit (qanchaga oshishi bilan);
  - operatsiyadan keyin asosiy qarz qoldig'i **manfiy** bo'ladigan sana (CR-10);
  - operatsiya sanasi shartnoma boshlanishidan oldin;
  - muddatdan keyin `berildi` operatsiyasi.
  - "Foiz to'lovi > foiz qarzi" — **Modul 4** da (foiz hisobi kerak).
- FR-3.4 — Shartnoma sahifasida operatsiyalar jadvali: sana, berildi, qaytarildi, foiz to'landi,
  har operatsiyadan keyingi qoldiq, izoh.
- FR-3.5 — Shartnoma kartasida va ro'yxatda: **jami berilgan** va **asosiy qarz qoldig'i** (FR-2.3).
- FR-3.6 — Operatsiyasi bor shartnomada tomonlarni o'zgartirib bo'lmaydi (FR-2.5).
- *Acceptance:* 05.01 — 60 000 000 berish va 20.01 — 15 000 000 qaytarishdan keyin qoldiq 45 000 000;
  limitdan oshganda ogohlantirish chiqadi, "Baribir saqlash" bilan saqlanadi.

### Modul 4: Oylik foiz hisoboti (yadro)
- FR-4.1 — Shartnoma bo'yicha oylik jadval — **boshlanish oyidan joriy oygacha** (joriy oy "bugungacha"
  belgisi bilan): oy, stavka, oy boshidagi qoldiq, berildi, qaytarildi, oy oxiridagi qoldiq, hisoblangan foiz,
  to'langan foiz, foiz qarzi (yig'ma). `boshidagi + berildi − qaytarildi = oxiridagi`.
- FR-4.2 — Oy ichidagi bo'laklar (davr, qoldiq, stavka, kun, foiz — 6 xona) — ochiladigan tafsilot.
- FR-4.3 — Hisob CR-1…CR-11 ga to'liq mos; yadro sof funksiya, mustaqil kunma-kun hisob bilan tekshirilgan.
- FR-4.4 — **Foiz qarzi** (ro'yxat va shartnoma kartasi) — **tugagan oylar** bo'yicha (faktura bilan bir xil);
  shartnoma sahifasida qo'shimcha "bugungacha hisoblangan" foiz.
- FR-4.5 — Ogohlantirishlar (FR-3.3 ga qo'shimcha): **foiz to'lovi > to'lov sanasigacha hisoblangan foiz qarzi**
  (tugagan oylar + to'lov oyi to'lov kunigacha, yaxlitlangan − boshqa foiz to'lovlari); **kelajak sana** (CR-11).
- *Acceptance:* etalon → yanvar 552 328,77; fevral 2026 → 483 287,67; kabisa fevral 2028; oy o'rtasidagi start,
  1-sanadan stavka o'zgarishi, manfiy qoldiq, muddatdan keyingi oy — testlar bilan; yadro tasodifiy ma'lumotda
  kunma-kun hisob bilan tiyinigacha teng.

### Modul 5: Stavkani o'zgartirish
- FR-5.1 — Yangi stavka + o'zgartirish sanasi (default — bugun; o'tgan yoki kelajak sana ham mumkin).
  Amal qilish sanasi CR-5 bo'yicha avtomatik hisoblanib, kiritish paytida ko'rsatiladi. Amal qilish sanasi
  boshlang'ich stavka sanasidan (shartnoma boshlanishi) **keyin** bo'lishi shart.
- FR-5.2 — Stavkalar tarixi shartnoma sahifasida (amal qiladi, kiritilgan sana, stavka).
- FR-5.3 — Boshlang'ich stavkadan boshqa istalgan o'zgarishni **o'chirish** (tasdiq bilan). Tahrir yo'q —
  noto'g'risi o'chirilib, to'g'risi qayta kiritiladi.
- FR-5.4 — Boshlang'ich stavkaning faqat **qiymatini** tuzatish (sanasi o'zgarmaydi).
- FR-5.5 — Ogohlantirish (bloklamaydi, "Baribir saqlash"): amal qilish sanasi **tugagan oyga** tushsa yoki
  boshlang'ich stavka tuzatilsa — qaysi tugagan oylar qayta hisoblanishi ko'rsatiladi (faktura yuborilgan bo'lishi mumkin).
- *Acceptance:* 15-martda kiritilgan stavka 1-apreldan, 1-aprelda kiritilgani 1-apreldan amal qiladi;
  aprel foizi yangi stavka bilan hisoblanadi.

### Modul 6: Excel eksport
- FR-6.1 — Shartnoma sahifasida "Excel yuklab olish" → `.xlsx`, **serverda** Modul 4 hisobot natijasidan
  (CONSTITUTION §11). Fayl nomi: `Shartnoma_<№>_<beruvchi>_<sana>.xlsx`.
- FR-6.2 — Varaqlar: **"Oylik hisobot"** (sarlavhada rekvizitlar: shartnoma № va sanasi, beruvchi/oluvchi STIR bilan,
  limit, muddat, joriy stavka, hisobot sanasi; oylik jadval + jami; joriy oy belgisi), **"Bo'laklar"** (FR-4.2),
  **"Operatsiyalar"** (berildi/qaytarildi/foiz to'landi, qoldiq, izoh — akt sverka sifatida).
- FR-6.3 — Summalar Excel'da **raqam** (`# ##0,00`), hisob-kitob qilsa bo'ladi. 15 muhim xonadan uzun summa
  (Excel aniqlik chegarasi) — aniqlik yo'qolmasligi uchun **matn**.
- FR-6.4 — Barcha shartnomalarni bitta faylga eksport — **kirmaydi** (keyinroq alohida modul bo'lishi mumkin).
- *Acceptance:* yuklab olingan fayl ekrandagi raqamlar bilan tiyinigacha mos (e2e fayl qayta o'qilib solishtiriladi).

### Modul 7: Oylik faktura ro'yxati (ilovada)
- FR-7.1 — Oy tanlanadi → shu oy uchun foizi > 0 bo'lgan har shartnoma bo'yicha bitta faktura qatori:
  beruvchi, oluvchi (STIR), shartnoma № va sanasi, qator nomi (§9.1 shabloni), summa.
- FR-7.2 — Bitta faktura = bitta shartnoma × bitta oy, bitta qator. Tarkibi §9.1 ga mos.
- FR-7.3 — Faktura summasi = shu oy uchun yaxlitlangan foiz (CR-4) — Modul 4 yadrosidan olinadi.
- FR-7.4 — Holat: `tayyor` / `qoralama yaratildi` (sana, Didox hujjat ID bilan). Holatni Modul 8 yoki
  buxgalter qo'lda belgilaydi. `qoralama yaratildi` bo'lsa qayta yaratishda ogohlantirish.
- FR-7.5 — Ro'yxatni beruvchi firma bo'yicha filtrlash; har maydonni bir bosishda nusxalash
  (Didox ulanmagan firma uchun ham qo'lda kiritish oson bo'lsin).
- *Acceptance:* etalon shartnoma uchun yanvar qatori 552 328,77 va to'g'ri qator nomi bilan chiqadi.

### Modul 8: Didox — avtomatik qoralamalar (yo'l B, 2026-10-12)
> Rasmiy partner token yo'q; Didox'ning tokenini olish taqiqlangan (CONSTITUTION §14). Ilova Didox saytini **o'z oynasida**
> ochadi va sahifani inson kabi boshqaradi. Real Didox oqimi: docs/research/didox-flow.md. Reja: docs/plans/M8-didox-drafts.md (v2).
> Bo'linish: **M8a** kalit va parollar · **M8b** avtomatik kirish · **M8c** qoralama yaratish · **M8d** jadval, tray, Windows.
- FR-8.1 — **ERI kalitlar (M8a).** Ilova kalitlar ro'yxatini lokal E-IMZO'dan oladi (`pfx.list_all_certificates`) va har
  kalitni firmaga **STIR** bo'yicha bog'laydi (sertifikat maydoni `1.2.860.3.16.1.1`). Firmalar sahifasida har firma uchun:
  "Kalit · DD.MM.YYYY gacha" / "Muddati o'tgan" / "Kalit yo'q"; E-IMZO ishlamasa — "E-IMZO ishlamayapti". Bir STIR'ga bir
  nechta amaldagi kalit bo'lsa — amal muddati eng uzog'i olinadi. Sertifikatdagi shaxsiy ma'lumotlar (JShShIR, F.I.Sh.)
  ilovada saqlanmaydi va log'ga yozilmaydi. E-IMZO'ga faqat ro'yxat o'qish so'rovlari yuboriladi (imzolash funksiyalari hech qachon).
- FR-8.2 — **ERI paroli (M8a).** Har firma uchun ilovada bir marta kiritiladi; faqat OS shifri bilan saqlanadi
  (Windows DPAPI / macOS Keychain — Electron `safeStorage`); UI'da qayta ko'rsatilmaydi, log'ga yozilmaydi, tarmoqqa
  chiqmaydi; o'chirish mumkin. Holat: "Parol bor" / "Parol yo'q" / "E'tibor kerak" (rad etilgan). Kalit almashtirilsa
  (seriya o'zgarsa) — parol qayta so'raladi. Faqat desktop ilovada; brauzer versiyasida bu ustun ko'rinmaydi.
- FR-8.3 — **Avtomatik kirish (M8b).** Firma uchun ilova Didox'ni alohida, izolyatsiyalangan oynada ochadi, login sahifasida
  firma kalitini STIR bo'yicha tanlaydi, "Кириш"ni bosadi va parolni **E-IMZO'ning o'z oynasiga bir marta** yozadi (yozishdan
  oldin oyna va parol maydoni fokusda ekani tekshiriladi). Kirilgan firma sotuvchi STIR bilan tasdiqlanadi. "Kirishni tekshirish"
  tugmasi aynan shuni bajarib chiqadi.
- FR-8.4 — **Qoralama yaratish (M8c).** Tugagan oy uchun tanlangan (sukut — barcha) beruvchi firmalar bo'yicha ketma-ket: kirish →
  har `tayyor` faktura uchun Didox formasi (Ҳисоб-фактура актсиз / Стандарт; shartnoma № va sanasi; kontragent STIR; bitta
  qator — MXIK 10401999001000000, nom §9.1, miqdor 1, narx = summa, ҚҚСсиз va imtiyoz Didox tomonidan, kelib chiqishi
  "Хизмат кўрсатиш"; **faktura raqami va sanasi bo'sh**) → avtomatik to'lgan qiymatlar va jami tekshiriladi → "Сақлаб қолиш" →
  qoralama ID'si Didox ro'yxatidan olinib ilovada yoziladi (`source: didox`) → chiqish. Didox oynasi ish paytida ko'rinadi,
  lekin foydalanuvchi kiritishi bloklanadi.
- FR-8.5 — **Takror yo'q.** Ilovada qoralama belgisi bor faktura o'tkaziladi; API qayta belgilashni tasdiqsiz rad etadi.
  "Saqlandi, lekin ID topilmadi" yoki saqlash paytida uzilgan faktura **karantinga** tushadi — avtomatik qayta urinilmaydi,
  buxgalter Didox'da tekshirib qo'lda hal qiladi. Ilovadan tashqarida yaratilgan o'xshash qoralama avtomatik moslanmaydi —
  ilova to'xtab xabar beradi.
- FR-8.6 — **Inson tezligi va to'xtash.** Harakatlar ketma-ket, belgilar va bosishlar orasida pauza; bir vaqtda bitta ish.
  Sahifa kutilganidan farq qilsa (element yo'q, qiymat boshqa) — shu firma to'xtaydi, skrinshot lokal saqlanadi, sababi
  o'zbekcha ko'rsatiladi; taxmin bilan davom etish va qayta urinish yo'q. Ish bekor qilinishi mumkin.
- FR-8.7 — **Natijalar.** Har ishga tushish lokal yoziladi (oy, kim/qachon, har faktura: yaratildi / o'tkazildi / xato /
  karantin, sabab, Didox ID) va ilovada ko'rinadi; ish paytida jonli jarayon.
- FR-8.8 — **Kirish xatosi.** Noto'g'ri parol, E-IMZO oynasi chiqmasligi yoki kirib bo'lmaslik → firma "E'tibor kerak"
  holatiga o'tadi, uning qolgan fakturalari o'tkaziladi, boshqa firmalar davom etadi. Avtomatik qayta urinish **taqiqlangan**;
  firma faqat buxgalter parolni qayta kiritsa yoki "tekshirildi" desa ochiladi.
- FR-8.9 — **Imzolamaydi.** Ilova hech qachon "Имзолаш"/"Юбориш"ni bosmaydi (kod qo'riqchisi va tarmoq bloki), E-IMZO'ning
  imzolash funksiyalarini chaqirmaydi, `.pfx`ni o'qimaydi. Imzolash — buxgalter Didox'da (raqam/sana qo'yib).
- FR-8.10 — **Jadval (M8d).** Har oy 1-kuni 06:00 (Asia/Tashkent) o'tgan oy uchun avtomatik — **faqat shartlar bajarilsa**:
  ekran qulflanmagan, foydalanuvchi band emas, E-IMZO ishlayapti, kalit tashuvchi ulangan, OS ruxsatlari bor. Bajarilmasa —
  bildirishnoma ("Didox qoralamalari kutmoqda") va ilova ochilganda / kompyuter uyg'onganda / qulf ochilganda davom etadi.
  Vaqtinchalik xatolar uchun 07:00 va 08:00 da faqat o'sha fakturalar qayta uriniladi (kirish xatolari va karantin bundan
  mustasno). Ilova tray'da yashaydi va tizim bilan birga ishga tushadi. Natija vaqti kafolatlanmaydi.
- *Acceptance (modul):* 2 firma × bir nechta faktura → "Didox'da qoralamalarni yaratish" → Didox Қоралама'dagi qoralamalar
  §9.1 ga maydonma-maydon mos, ID'lar ilovada; qayta ishga tushirish hech narsa yaratmaydi; noto'g'ri parol bir urinishdan
  keyin to'xtaydi va firmani belgilaydi; Didox elementi o'zgarsa skrinshot bilan to'xtaydi. macOS'da qabul qilinadi;
  Windows (production) — M8d gate.

### Modul 9: Lokal desktop ilova (2026-10-11 dan; server yo'q)
> Har buxgalter kompyuteriga alohida o'rnatiladi (umumiy server/baza yo'q). Reja: docs/plans/M9-desktop-shell.md.
- FR-9.1 — **M9a:** lokal PGlite baza, dastur ichida migratsiya (migratsiyadan oldin snapshot) — qabul qilingan.
- FR-9.2 — **M9b:** Electron qobig'i (API child-process'da, statik web, birinchi ishga tushishda parol) — o'zak qabul qilingan;
  qadoqlash (macOS dir), Windows NSIS va imzolash — qolgan.
- *Acceptance:* ilova serversiz ochiladi, ma'lumot lokal saqlanadi va qayta ochilganda turadi.

### Modul 10: Kiritish qulayliklari (Sir, 2026-10-09)
- FR-10.1 — Barcha summa maydonlari **yozilayotganda** formatlanadi: `2000000` → `2 000 000`, kasr — vergul
  (`1 234,5`). Kursor joyi saqlanadi; nusxa joylanganda ham ishlaydi.
- FR-10.2 — Sana tekshiruvi (barcha sana maydonlari: shartnoma, operatsiya, stavka): mavjud bo'lmagan sana
  (yil 4 xonali emas, 31-fevral) va **2000–2100 oralig'idan tashqari yil** — maydon ostida xato. Server ham tekshiradi.
- FR-10.3 — Oylik hisobot jadvalida **yil filtri** (default — joriy yil; "Barcha yillar" ham bor).
- *Acceptance:* `2000000` yozilsa maydonda `2 000 000` ko'rinadi va `2000000.00` saqlanadi; `20266` yilli sana
  saqlanmaydi; hisobotda 2025 tanlansa faqat 2025 oylari.

### Modul 11: Shartnomalar ro'yxati — qidiruv, filtr, saralash (Sir, 2026-10-09)
- FR-11.1 — Qidiruv: shartnoma raqami, beruvchi/oluvchi nomi yoki STIR bo'yicha.
- FR-11.2 — Filtr paneli: Beruvchi, Oluvchi, imzo sanasi oralig'i. Filtrlar manzilda saqlanadi (havola bilan ulashsa bo'ladi).
- FR-11.3 — Ustun sarlavhasini bosish — shu ustun bo'yicha saralash (o'sish/kamayish).
- FR-11.4 — "Tomonlar" o'rniga **Beruvchi** va **Oluvchi** alohida ustunlar; nom ostida STIR raqami ("STIR" so'zisiz).
- *Acceptance:* demo ma'lumotda "GAMMA" qidirilsa 2 ta shartnoma; Oluvchi = DELTA AGRO filtri 2 ta; foiz qarzi bo'yicha saralash.

### Modul 12: Davr hisoboti va Excel (Sir, 2026-10-09)
- FR-12.1 — Shartnomalar sahifasida **davr** tanlanadi: butun oylar (boshlanish oyi — tugash oyi), tezkor tanlov:
  joriy oy, o'tgan oy, chorak, yil. Davr tanlanmasa — hozirgi ko'rinish (bugungi holat).
- FR-12.2 — Davr tanlanganda har shartnoma uchun: davr ichida **berildi, qaytarildi, hisoblangan foiz,
  to'langan foiz**; davr oxiriga **qoldiq va foiz qarzi**. Joriy oy davrga kirsa — bugungacha (CR-11).
  Foiz = davr oylarining yaxlitlangan oylik foizlari yig'indisi (fakturalar bilan tiyinigacha mos, CONSTITUTION §11).
- FR-12.3 — Excel: **ekrandagidek** — bitta varaq, joriy filtr/qidiruvdagi shartnomalar, shu ustunlar, pastda jami qator.
  Bu FR-6.4 dagi "barcha shartnomalar eksporti" o'rnini bosadi.
- *Acceptance:* etalon shartnoma, davr Yanvar–Fevral 2026: berildi 60 mln, qaytarildi 15 mln, foiz 1 035 616,44,
  qoldiq 45 mln; Excel ekran bilan tiyinigacha mos.

## 6. Nofunktsional talablar
- **Aniqlik:** pul va stavka hech qachon `float`'da hisoblanmaydi — DB'da `Decimal`, kodda decimal kutubxona
  yoki butun son (BigInt, tiyin) — foiz yadrosi BigInt'da.
- **Performance:** bitta shartnoma hisoboti (19+ oy, yuzlab operatsiya) < 1 s.
- **Security:** ilova login paroli argon2 hash; login urinishlariga rate-limit. ERI parollari faqat OS shifri bilan
  (`safeStorage`, FR-8.2) buxgalter kompyuterida; `.pfx` E-IMZO'da qoladi. Didox oynasi ilovadan izolyatsiyalangan.
  Parol + `.pfx` bir kompyuterda bo'lgani uchun imzolash texnik mumkin — bu Sir tomonidan ongli qabul qilingan
  (CONSTITUTION §13), FR-8.9 kod qo'riqchilari bilan ushlanadi.
- **Reliability:** migratsiyadan oldin baza snapshot'i; kunlik zaxira — M9 qadoqlash bosqichida.
- **Til / format:** UI o'zbek (lotin); sana `dd.mm.yyyy`; summa `552 328,77`.

## 7. Tech stack & arxitektura
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind
- Infra: Electron desktop ilova (`apps/desktop`), lokal PGlite baza; Windows (production), macOS (dev)
- Arxitektura eslatmalari:
  - **Foiz hisoblash yadrosi — sof funksiya** (DB/HTTP'siz): kirish — shartnoma, stavkalar tarixi,
    operatsiyalar; chiqish — kunlik bo'laklar va oylik jadval. Barcha CR qoidalari shu yerda va
    shu yerda test qilinadi.
  - Monorepo: `apps/api`, `apps/web`, `apps/desktop`.
  - Didox — `apps/desktop` (Electron main) ichida: E-IMZO klienti, ERI parol ombori, Didox oynasi drayveri. Didox DOM bilimi
    bitta joyda (`locators`). API Didox'ni bilmaydi — faqat qoralama belgisini (`invoice_drafts`, `source`) saqlaydi.

## 8. UI/UX
- Dizayn manbai: `design/` papka hozircha yo'q — oddiy, toza admin-panel uslubi (shadcn).
- Asosiy ekranlar: Kirish → Shartnomalar ro'yxati → Shartnoma sahifasi (operatsiyalar, stavkalar,
  oylik hisobot, eksport) → Firmalar.

## 9. Tashqi bog'liqliklar / integratsiyalar
- **Didox** (didox.uz) — schyot-faktura qoralamasi, Didox saytini ilova oynasida boshqarish orqali (Modul 8, §9.2).
- **E-IMZO** (lokal, `ws://127.0.0.1:64646`) — ERI kalitlar ro'yxati; parol oynasi E-IMZO'niki.

### 9.1 Schyot-faktura namunasi (Sir bergan, 2026-09 dagi haqiqiy faktura asosida)
> Haqiqiy firma rekvizitlari repo'ga yozilmaydi — faqat tuzilma.

| Maydon | Manba | Namunadagi qiymat / format |
|---|---|---|
| Hujjat turi | doimiy | Счет-фактура без акта |
| Faktura № va sanasi | buxgalter (§10) | `№ 690 от 15.09.2026` — oy tugaganidan keyin |
| Shartnoma | Contract | `к договору № {raqam} от {dd.mm.yyyy}` |
| Yetkazib beruvchi | beruvchi Firm | nomi, manzil, INN, QQS reg. kodi, р/с, MFO |
| Xaridor | oluvchi Firm | nomi, manzil, INN, QQS reg. kodi, р/с, MFO |
| Qator nomi | shablon | `Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за {oy} {yyyy} г.` (oy ruscha: август) |
| MXIK (ИКПУ) kodi | sozlama | `10401999001000000` — "Маблағларни ўтказиш билан боғлиқ молиявий операциялар (мукофот тўловларидан ташқари)" |
| O'lchov birligi | doimiy | xizmat (so'm) |
| Miqdor | doimiy | 1 |
| Narx = Qiymat | Modul 4 | oy foizi, 2 xona (CR-4) |
| QQS | sozlama | Без НДС |
| Kelib chiqishi | doimiy | Оказание услуг |

Tekshiruv: namunadagi summa `43 572 602,74 × 365 = 15 904 000 000,10` — ya'ni amaldagi hisob
**365 kunlik** asosda yuritilgan; CR-2 bilan mos.

Mijoz bilan suhbat (2026-10-07) natijasida:
- Qator nomi shabloni, MXIK, birlik, miqdor, "Без НДС", "Оказание услуг" — **hech qachon o'zgarmaydi**,
  barcha shartnomalar uchun bir xil. Faqat oy nomi va narx (oy foizi) o'zgaradi.
- Faktura raqami va sanasini **buxgalter Didox'da o'zi** qo'yadi (ilova bo'sh qoldiradi).

### 9.2 Didox'dagi qo'lda jarayon (skrinshotlar asosida) va spike savollari
Hozir buxgalter qo'lda: Ҳужжатлар → Яратиш → tur **"Ҳисоб-фактура актсиз" / "Стандарт"** →
"Сизнинг маълумотларингиз" (sotuvchi) **Didox akkauntidagi joriy firmadan avtomatik** to'ladi →
kontragent STIR kiritiladi, nomi o'zi chiqadi → qator to'ldiriladi (QQS default 12% → "Без НДС",
shunda QQS imtiyozi o'zi qo'yiladi; "Олди-сотди" → "Хизмат кўрсатиш") → **Сақлаб қолиш** → qoralama.
Didox qo'lda saqlashda bo'sh majburiy maydonlarga ruxsat beradi.

Spike natijasi — to'liq: [research/didox.md](research/didox.md) (2026-10-07; asosiy da'volar rasmiy hujjatda qayta tekshirildi):
- [x] Rasmiy partner API bor: `api-docs.didox.uz`. Kerak: **partner token** (Didox account manager beradi).
  Test: `testapi3.didox.uz`, prod: `api-partners.didox.uz`.
- [x] Qoralama: `POST /v1/documents/002/create/{locale}` — "Создаёт документ в черновиках", imzosiz.
  `update` / `delete/draft` ham bor.
- [x] Kirish **.pfx'siz** mumkin: `POST /v1/auth/{taxId}/password/{locale}` — firma Didox paroli bilan
  ("Вход без ЭЦП"). Token 360 daqiqa. ⚠️ Noto'g'ri parol: 3/daq → 10 daq blok, 10 → 24 soat,
  **25 → doimiy blok** — ilova hech qachon avtomatik qayta urinmaydi.
- [x] Ko'p firma: bitta partner token + har firma uchun alohida `user-key` (firma paroli orqali).
- [ ] Bo'sh `FacturaNo` / `FacturaDate` bilan API qoralamani qabul qiladimi — hujjatda majburiy; testda tekshiriladi.
- [ ] "Без НДС" uchun `LgotaId` qiymati hujjatda yo'q — buxgalter yaratgan namunaviy qoralamani API orqali o'qib olinadi.
- [x] "Excel юклаш" — ommaviy API emas, faqat UI ichida; zaxira yo'l sifatida qoladi.

**2026-10-11 — yo'l o'zgardi (Sir):** rasmiy ulanib bo'lmaydi → lokal ilova, ERI (E-IMZO) bilan kirish, Didox ichki API.
Quyidagi 2026-10-07 qarori endi amal qilmaydi.

**Tanlangan yo'l (Sir, 2026-10-07) — BEKOR:** partner API + firma Didox akkaunt paroli.
Serverda: partner token (`.env`) va har beruvchi firmaning Didox paroli (shifrlangan). ERI kaliti
serverga **berilmaydi** — imzo faqat buxgalterda. Firma paroli — ERI (.pfx) paroli emas, Didox'da
ro'yxatdan o'tishda o'rnatilgan akkaunt paroli ([research/didox-partner-token.md](research/didox-partner-token.md)).

Ko'rib chiqilib rad etilgan: "Excel юклаш" (Sir rad etdi); ilovani buxgalter kompyuterida ishlatish
(API ehtiyojini yo'qotmaydi); Didox cookie / ichki API (**taqiqlangan** — rasmiy emas, akkaunt bloklanishi
xavfi); brauzer kengaytmasi (Sir API'ni tanladi).

## 10. Ochiq savollar (Sir hal qiladi)
- [x] Stavka `o'zgartirish sanasi` — buxgalter kiritadigan maydon (default bugun) — SRS bilan tasdiqlandi
- [x] Didox: qoralama namunasi — berildi (§9.1)
- [x] UI tili — faqat o'zbek (lotin)
- [x] Faktura raqami — buxgalter Didox'da o'zi qo'yadi
- [x] Faktura sanasi — buxgalter Didox'da o'zi qo'yadi
- [x] Qator nomi, MXIK, "Без НДС" — doimiy, barcha shartnomalar uchun bir xil
- [x] Har MCHJ'ning **o'z Didox login'i** bor; buxgalter ERI (.pfx) kaliti bilan kiradi
- [x] Didox yo'li — ~~partner API~~ → **B: ilova Didox saytini o'z oynasida boshqaradi, ERI bilan avtomatik kirish** (2026-10-12)
- [x] Partner token — Sir Didox account manager'ga yozadi; token **mijoz nomidan**
- [x] Bitta buxgalter — bir nechta firma; buxgalterlar Didox akkaunt parolini biladi
- [x] Kirish va qoralama yaratish avtomatik; oy 1-kuni 06:00 — **shartli** (FR-8.10), natija vaqti kafolatlanmaydi (2026-10-12)
- [x] Imzolash — buxgalter Didox'da qoralamalarni birdaniga imzolaydi; raqam/sanani Didox'da o'zi qo'yadi
- [ ] Didox UI'da bir nechta qoralamani birdaniga imzolash imkoni — TEKSHIRILMADI (Didox tomoni, ilovaga ta'sir qilmaydi)
- [ ] API bo'sh `FacturaNo`/`FacturaDate` bilan qoralamani qabul qiladimi — test muhitida
- [x] Avtomatik ishga tushish — oy 1-kuni, 09:00 gacha tayyor (start 06:00, qayta urinish 07:00/08:00); natija faqat ilovada
- [ ] Server: OS, domen, kim boshqaradi (Modul 9 gacha)


---

<!-- ===== Manba: docs/research/didox-flow.md ===== -->

# Didox oqimi — xaritalash (yo'l B, brauzerni boshqarish)

> 2026-10-12, Sir bilan birga real Didox'da (uning Chrome'i orqali, faqat o'qib) xaritalanmoqda.
> Maqsad: "Счет-фактура без акта" (doctype 002, "Стандарт") **qoralamasini** ERI bilan kirib yaratish oqimini
> aniqlash — maydonlar, tugmalar, xulq. Imzolash yo'q (buxgalter Didox'da o'zi).

## 1. Login (ERI)
- Hujjat yaratishga o'tish: `https://didox.uz/documents/new` → kirilmagan bo'lsa
  `https://didox.uz/login_with_signature?r=/documents/new&isInternal=true` ga yo'naltiradi.
- Kirish turlari: **Калит орқали** (ERI, `/login_with_signature`), Парол орқali (`/login`), USB Токен (`/login_usb`).
- ERI: E-IMZO faol bo'lsa, kalit(lar) ro'yxatda chiqadi; **qidiriladigan ro'yxat** ("Поиск...") — ko'p kalitdan tanlash.
  Kalit kartasi: firma nomi + STIR + amal muddati (masalan "<FIRMA> MCHJ / <STIR 9 raqam> / до DD.MM.YYYY").
  **Кириш** tugmasi → E-IMZO **o'z oynasida** parol so'raydi (ilova ko'rmaydi).
- **Firma modeli (Sir, 2026-10-12): har firma — alohida ERI kaliti.** Firma tanlash = login'da kalit tanlash.
  Avtomatlashtirish har firma uchun alohida kiradi (kerakli kalit → E-IMZO parol → o'sha firma qoralamalari).
  ⚠️ Demak oy 1-kuni to'liq avtonom emas: har firma uchun buxgalter E-IMZO parolini kiritadi.
- **Kalitni ilova tanlaydi (Sir, 2026-10-12).** Buxgalter ilovada firmani tanlaydi → ilova Didox login sahifasida
  shu firmaning kalitini **STIR bo'yicha** topib bosadi va "Кириш"ni bosadi → buxgalter faqat E-IMZO parolini kiritadi →
  ilova o'sha firma qoralamalarini yaratadi. Buxgalter Didox'dagi kalit ro'yxatini qo'lda varaqlamaydi.
  - Moslash: kalit kartasidagi STIR = ilovadagi firma STIR. Muddati o'tgan kalitlar o'tkazib yuboriladi.
  - Ochiq: bitta STIR uchun bir nechta amaldagi kalit (masalan, direktor + buxgalter) bo'lsa qaysi biri —
    taklif: muddati eng uzog'i, yoki buxgalterdan bir marta so'rab eslab qolish.
  - Ochiq: kalit topilmasa (E-IMZO'da yo'q / muddati o'tgan) — ilova aniq xabar beradi, kirishga urinmaydi.
- **Kalit ro'yxati DOM'i** (2026-10-12, o'qildi): "Калитингизни танланг" bosilsa qidiruv maydoni ("Поиск...") va menyu
  `.certs-select__menu` ochiladi; har kalit — `.certs-select__item` ichida `.certs-select__item--name` (firma nomi),
  `.certs-select__inn` (STIR, faqat raqam), `.certs-select__expire` ("до DD.MM.YYYY"). E-IMZO bilan bog'lanish
  Didox bundle'ida (`index_*.js`) — global `EIMZOClient`/`CAPIWS` yo'q. Ilova uchun reja: menyuni ochish →
  `.certs-select__inn` matni = firma STIR bo'lgan elementni bosish → "Кириш".
  ⚠️ Class nomlari Didox build'iga bog'liq — buzilsa ilova to'xtab aniq xabar berishi kerak.

## 1a. Kalitlar ro'yxati — to'g'ridan-to'g'ri E-IMZO'dan (Sir, 2026-10-12)
- **Tekshirildi (Sir Mac'i, E-IMZO v6.4.7 Standard):** Node 24 o'zining `WebSocket`i bilan
  `ws://127.0.0.1:64646/service/cryptapi` va `wss://127.0.0.1:64443/service/cryptapi` (TLS tekshiruvisiz) ga ulandi;
  `{name:"version"}` va `{plugin:"pfx",name:"list_all_certificates"}` **API-KEY yubormasdan, Origin'siz** javob berdi.
  → Electron main jarayoni E-IMZO'dan kalit ro'yxatini o'zi oladi (e-imzo.md TL;DR 3 dagi noaniqlik o'qish chaqiruvlari uchun yopildi;
  `load_key`/`create_pkcs7` uchun tekshirilmagan — ilovaga kerak ham emas).
- Har kalit: `{disk, path, name, alias}`. `disk` — `.pfx` turgan papka, `name` — fayl nomi (kengaytmasiz).
  `alias` — vergul bilan ajratilgan X.500 maydonlari (kichik harfda):
  `o` (tashkilot nomi), **`1.2.860.3.16.1.1` (STIR)**, `1.2.860.3.16.1.2` (JShShIR — shaxsiy), `t` (lavozim, masalan direktor),
  `cn`/`name`/`surname` (egasi — shaxsiy), `serialnumber`, `validfrom`/`validto` (`YYYY.MM.DD HH:mm:ss`), `l`, `st`, `c`.
- **Ilova uchun oqim:**
  1. Ilova E-IMZO'dan ro'yxatni oladi → STIR bo'yicha o'z firmalariga bog'laydi; ekranda har firma yonida "kalit bor / yo'q /
     muddati o'tgan (validto)" ko'rinadi. Buxgalter faqat kaliti bor firmani tanlay oladi.
  2. Didox oynasida (didox.uz, Didox o'zi E-IMZO bilan gaplashadi) ilova kalit menyusidan `.certs-select__inn` = STIR
     (bir nechta bo'lsa `.certs-select__expire` = tanlangan kalitning `validto`) elementni bosib "Кириш"ni bosadi.
  3. E-IMZO parolni o'z oynasida so'raydi — buxgalter kiritadi. Ilova parolni ko'rmaydi.
- Shaxsiy maydonlar (JShShIR, F.I.Sh.) ilovada saqlanmaydi va log'ga yozilmaydi — faqat STIR, `o`, `t`, `validto`.
- Ochiq: E-IMZO ishlamayotgan bo'lsa (ulanish rad) — ilova "E-IMZO'ni ishga tushiring" deydi.

## 1b. E-IMZO parolini avtomatik yozish — spike YASHIL (macOS, 2026-10-12)
- AppleScript (System Events): `E-IMZO` jarayonida oyna paydo bo'lishini kutadi → parolni macOS Keychain'dan
  (`security find-generic-password -s moliyaviy-yordam-eri -a <STIR> -w`) o'qiydi → `frontmost` → `keystroke` → Return.
- Natija (Sir): Didox'da "Кириш" bosilgach E-IMZO parol oynasi chiqdi, **parolni skript o'zi yozdi**, Didox'ga kirildi.
  Parol skriptdan, log'dan va chatdan o'tmadi. Skriptni Sir o'z terminalida ishga tushirdi (Accessibility ruxsati bilan).
- macOS jarayon nomi: `/Applications/E-IMZO.app/Contents/MacOS/E-IMZO` → System Events'da `process "E-IMZO"`.
- Eslatma: `keystroke` joriy klaviatura tartibiga bog'liq (ABC kerak). Windows'da `SendInput` + `KEYEVENTF_UNICODE` —
  tartibga bog'liq emas. Oyna elementlari tuzilishi (terminal log'i) olinmadi — Windows spike'ida qayta o'rganiladi.
- Production'da parol manbai — Electron `safeStorage` (CONSTITUTION §13), Keychain faqat spike uchun.

## 2. Hujjat yaratish formasi (o'qildi 2026-10-12, hech narsa saqlanmadi)
- Login'dan keyin `/documents/new?tab=all…` — hujjatlar ro'yxati; tablar: Кирувчи, Чиқувчи, **Қоралама**, Шаблонлар,
  **Excel юклаш** (muqobil yo'l — keyin ko'riladi). **"Яратиш"** → `/create_document`.
- Ochilganda **"Диққат!" modal** (ҚҚС guvohnomasi haqida ogohlantirish) → **"Ёпиш"** bilan yopiladi — har safar.
- Tur tanlash: ikki `select.doc-types__select` — 1) "Ҳисоб-фактура актсиз" (sukut), 2) "Стандарт" (sukut). Bizga aynan shu.
- **Sarlavha maydonlari** (`input.input__input`, `name`/`id` yo'q — label matni bo'yicha topiladi):
  `*Ҳисоб-фактура рақами`, `*Шартнома рақами`, `*Ҳужжат санаси` (date), `*Шартнома санаси` (date), `Шартнома ID`, `ТТЮ ИД`.
  ⚠️ Faktura raqami/sanasi formada **majburiy** (`*`), SRS §9.1 esa ularni buxgalter qo'yadi deydi → qoralamani ularsiz
  saqlash mumkinmi — **sinov saqlash bilan tekshiriladi** (ochiq savol 1).
- **Sizning маълумотларингиз** (sotuvchi = kirgan firma): STIR `disabled` va **avtomatik to'ldirilgan**; nom, ҚҚС reg. raqami,
  hisob raqami (select+input), MFO, bank, manzil, direktor, bosh hisobchi — hammasi Didox profilidan to'ldiriladi.
  Checkbox'lar: Воситачи, ҚҚС имтиёзи, Акциз (o'chiq).
- **Контрагент**: `*СТИР/ЖШШИР` (bo'sh) → kiritilsa nom/manzil/direktor Didox'dan to'ldirilishi kutiladi (**tekshirilmagan**,
  ochiq savol 2). Филиал (MUI autocomplete), "бир томонлама ҳужжат", "Лот мавжуд" checkbox'lari.
- "Товар қўйиб юборган" (STIR, ФИШ) — ixtiyoriy, bo'sh qoladi.
- **Tovar/xizmat jadvali** (`main table`, 1 qator sukut; qator inputlari tartibda):
  `*МХИК ва номи` (MUI autocomplete) · `*изоҳ` · штрих код · `*ўлчов бирлиги` (MUI) · `*Сони` · `*Нарҳ` ·
  `*етказиб бериш нарҳи` · `ққс, %` (MUI select: **ҚҚСсиз**, 0%, 6%, 12%, 15% — **sukut 12%!**) · `*ққс миқдор` · `*Жами` ·
  Омбор (MUI) · `*Товарни келиб чиқиши` (MUI, sukut "Олди-сотди"). Ustida: Тескари ҳисоб, Акциз, Товар маркировкаланган,
  **Қўлда ҳисоблаш** checkbox'lari. Bizning qator (SRS §9.1): MXIK 10401999001000000, Сони 1, Нарҳ = oy foizi, **ҚҚСсиз**.
- Ишончнома bloki — bo'sh qoladi.
- **Tugmalar:** "Ҳужжатни кўрсатиш", **"Сақлаб қолиш"** (qoralama — bizniki), ⛔ **"Имзолаш"** (ilova hech qachon bosmaydi, §12),
  "Бекор қилиш".
- Texnik: React + MUI; inputlarda `name`/`id` yo'q → selector = label matni + tartib. React controlled input — qiymat
  `nativeInputValueSetter` + `input` event bilan yoki haqiqiy klaviatura bilan beriladi (spike'da tanlanadi).

## 2a. Sinov qoralamasi (2026-10-12, Sir ruxsati bilan; yaratildi → o'chirildi)
Firma A (Sir kaliti) → firma B (Sir ro'yxatidagi guruh firmasi; haqiqiy nom/STIR repo'ga yozilmaydi), shartnoma `TEST-1` 12.10.2026,
summa 1.00, izoh "SINOV - o'chiriladi". "Имзолаш"ga tegilmadi.
- **"Диққат!" modal** faqat sessiyadagi birinchi `/create_document` da chiqdi — ikkinchi ochishda yo'q (ilova ikkala holatni ko'taradi).
- Kirgandan keyin toast: "Ушбу корхона учун филиал танлаш имконияти мавжуд" — e'tiborsiz.
- **Sana maydoni** — niqobli matn (`__.__.____`) + kalendar; raqamlarni ketma-ket yozish (`12102026`) ishladi.
  Kalendarda kelajak sanalar yopiq.
- **Kontragent STIR** yozilgach ~1–2 s ichida nom, QQS reg. raqami, hisob raqami, MFO, bank, manzil, direktor, bosh hisobchi va
  QQS statusi **avtomatik to'ldi** → ilova kontragent rekvizitlarini yozmaydi, faqat STIR.
- **MXIK**: kodni yozish → autocomplete'da bitta variant → bosilganda:
  ўлчов бирлиги o'zi **"xizmat (so'm)"** (yagona variant), **ққс o'zi "ҚҚСсиз"**, yangi **"Имтиёз"** ustuni paydo bo'lib
  **102898** (SK 244-m. 1-band 10-xatboshi) qo'yildi. Ya'ni "12% → Без НДС" qadamini MXIK o'zi bajaradi — ilova baribir
  tekshiradi (kutilmagan qiymat → to'xtash).
- Сони 1 + Нарҳ → "етказиб бериш нарҳи" va "Жами" avtomatik.
- "Товарни келиб чиқиши" sukut **"Олди-сотди"** qoldi — SRS §9.1/§9.2 bo'yicha **"Хизмат кўрсатиш"** ga o'zgartirish kerak
  (sinovda o'tkazib yuborildi).
- **"Сақлаб қолиш" — faktura raqami va sanasi BO'SH holda saqlandi** (validatsiya xatosi yo'q) → SRS FR-8.6 tasdiqlandi.
  Saqlangach `/documents/new/draft` ro'yxatiga o'tadi, **lekin ro'yxat bo'sh qoldi — qayta yuklash kerak bo'ldi**.
- **Qoralama ID**: UUIDv1 hex (32 belgi, defissiz), havola `/documents/{ID}/1`; ID ichidagi vaqt yaratilish vaqtini beradi.
  Saqlash javobi ID'ni ko'rsatmaydi → ilova ID'ni Қоралама ro'yxatidan oladi (kontragent STIR + shartnoma № + summa bo'yicha,
  eng yangisi). Qoralamada **Rouming ID** ham bor (soliq tizimiga qoralama bosqichida yetadi).
- `/documents/{ID}/1` ni **to'g'ridan-to'g'ri URL** bilan ochish bo'sh "Хато" berdi; ro'yxatdan bosib ochish ishladi.
- Qoralama sahifasi tugmalari: Ўзгартириш, **Нусха олиш**, ⛔ Имзолаш, Ўчириш. O'chirish — custom modal "Амални тасдиқланг"
  → "Ўчириш" → holat **"ҚОРАЛАМА ЎЧИРИЛДИ"** (yumshoq o'chirish, hujjat ko'rinib turadi).
- **Qoralama ro'yxati (`/documents/new/draft`, xaritalandi):** `?tab=all&page=1&limit=20&partner=<STIR>` — kontragent STIR
  bo'yicha **URL orqali filtr** ("СТИР бўйича қидириш" maydoni shuni qo'yadi). Jadval MUI; ustunlar: [1] xavf, [2] holat
  (`.doc-status--white` faol qoralama, `.doc-status--red` o'chirilgan — **o'chirilganlar ham "Барчаси"da qoladi**), [3] tur,
  [4] kontragent nom + STIR, [5] hujjat № va sana, [6] shartnoma № va sana, [7] ҚҚСсиз summa, [8] ҚҚС bilan, [9] ҚҚС. Har katak
  `<a href="/documents/{32hex}/1">`. "Яратилган" tabi (`tab=created`) bo'sh chiqdi — ishlatilmaydi.
- Chrome kengaytmasining tarmoq kuzatuvi Didox XHR'larini ko'rsatmadi — API so'rovlari xaritalanmadi (B yo'lida kerak emas).

## 3. Ochiq savollar
1. ~~Raqam/sanasiz saqlash~~ — ha (§2a). 2. ~~Kontragent avto-to'ldirish~~ — ha. 3. ~~Ўлчов бирлиги~~ — "xizmat (so'm)".
4. ~~Qoralama ID~~ — Қоралама ro'yxatidan (§2a).
5. "Excel юклаш" — ko'p qoralamani bir yo'la yuklash formadan ishonchliroqmi?
6. ~~E-IMZO avtomatik parol spike~~ — **ishladi** (§1b).
7. "Товарни келиб чиқиши" ro'yxatida "Хизмат кўрсатиш" varianti matni aniq qanday (keyingi sinovda).
8. "Нусха олиш" — o'tgan oy qoralamasidan nusxa olib faqat narx/izohni o'zgartirish formadan soddaroqmi?


---

<!-- ===== Manba: docs/research/e-imzo.md ===== -->

# E-IMZO bilan Didox'ga ERI orqali kirish — tadqiqot (spike)

Sana: 2026-10-11. Til: o'zbekcha (lotin), texnik atamalar inglizcha. Kod o'zgartirilmagan.
Maqsad: mahalliy (Windows) o'rnatilgan ilova buxgalterning ERI (`.pfx`, E-IMZO orqali) bilan Didox'ga **faqat login** qilishi va qoralama (`002`) yaratishi uchun E-IMZO qanday ishlashini aniqlash. Konstitutsiya §12–16: ilova hujjatni **hech qachon imzolamaydi/yubormaydi**; `.pfx` E-IMZO'da qoladi; parolni buxgalter E-IMZO'ning **o'z oynasida** kiritadi; login xatosida avtomatik qayta urinish yo'q.

Belgilar: **[TASDIQLANDI]** — birlamchi manba to'g'ridan-to'g'ri aytadi (rasmiy hujjat, rasmiy demo kod, Didox'ning o'z JS'i). **[XULOSA]** — mening xulosam. **[TEKSHIRILMADI]** — tasdiqlab bo'lmadi.

Manba turlari haqida halol eslatma:
- "Birlamchi" = e-imzo.soliq.uz / test.e-imzo.uz (NITs NT, E-IMZO muallifi), api-docs.didox.uz, didox.uz JS bundle.
- `github.com/qo0p/e-imzo-doc` — E-IMZO ekosistemasi bo'yicha batafsil, E-IMZO v6 ni qamrab oladigan, test.e-imzo.uz demosiga mos hujjat, lekin **rasmiy sayt emas** (GitHub). Shuning uchun undan olingan da'volarda `(ikkilamchi: qo0p)` deb yozaman; ular test.e-imzo.uz demo kodiga mos kelgan joyda **[TASDIQLANDI]** deb qoldirdim.
- Maxfiy qiymatlar (Didox'ning `Partner-Authorization` tokeni, API-KEY hex satrlari, RSA kalit) bu hujjatga **ko'chirilmadi**.

---

## 0. Eng muhim topilmalar (TL;DR)

1. **E-IMZO — mahalliy Java ilova** (Windows uchun JRE 1.8 / JRE 17 / JRE'siz zip variantlari), `127.0.0.1` da WebSocket serveri: `wss://127.0.0.1:64443/service/cryptapi` (TLS) va `ws://127.0.0.1:64646/service/cryptapi` (oddiy). Xabarlar JSON: `{plugin, name, arguments}`. **[TASDIQLANDI]**
2. **Parolni E-IMZO'ning o'zi so'raydi** (`create_pkcs7` chaqirilganda), chaqiruvchi parolni ko'rmaydi → bizning qoidamizga mos. `load_key` parol so'ramaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
3. **Kirish nazorati: API-KEY (domen + kalit).** `localhost` va `127.0.0.1` uchun ichki kalitlar bor (rasmiy demoda ochiq); E-IMZO v6 da domen bo'yicha kalitni o'zi yuklashi mumkin. Origin'ni tekshirish ehtimoli yuqori, lekin to'g'ridan-to'g'ri "Origin tekshiriladi" degan matn topilmadi. Node.js klient mumkin, lekin hands-on test kerak. **[XULOSA]** → **2026-10-12 amalda tekshirildi:** Node 24 `WebSocket` API-KEY va Origin'siz `version` + `pfx.list_all_certificates` oldi (64646 va 64443, v6.4.7, macOS). `load_key`/`create_pkcs7` sinalmadi. Batafsil: didox-flow.md §1a
4. **Didox login oqimi** (4 qadam): `list_all_certificates` → `load_key` → `create_pkcs7(INN base64, keyId, "no")` → Didox `POST /v1/dsvs/timestamp` → `POST /v1/auth/{INN}/token/ru {signature}`. **[TASDIQLANDI]**
5. **ASOSIY TO'SIQ / QAROR TALAB QILADI:** Didox veb-ilovasi o'z so'rovlariga `Partner-Authorization` sarlavhasini qo'shadi — bu **Didox'ning o'z, JS ichiga joylangan partner tokeni**, RSA-OAEP bilan shifrlangan `{token, iat}` ko'rinishida. "Veb-ilova ishlatadigan ichki endpoint'lar"ni qayta ishlatish uchun shu tokenni va shifrlash kalitini Didox JS'idan olib ishlatish kerak bo'lardi (bu 6-bo'limda). Bu "ichki endpoint'ni chaqirish"dan jiddiyroq: **Didox'ning o'z kredensialini (partner tokenini) ishlatish**. Rasmiy hujjat esa ERI-login'ni ham partner token talab qiladi deydi. **[TASDIQLANDI]**
6. **Qorovulsiz (kuniga 06:00) ishga tushish — amalda mumkin emas:** parol har safar E-IMZO oynasida kiritiladi; "6 soat eslab qolish" faqat buxgalter oynada qo'lda belgilasa va E-IMZO ishlab turgan bo'lsa ishlaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
7. **macOS uchun E-IMZO bor** (v6.4.7 `.dmg`, arm64 va Intel) — rasmiy yuklab olish sahifasida. **[TASDIQLANDI]**

---

## 1. E-IMZO arxitekturasi

### 1.1. Nima lokal ishlaydi

- E-IMZO — kompyuterga o'rnatiladigan dastur; Didox hujjati: "для корректной интеграции необходимо установить и запустить приложение E-IMZO"; o'rnatilganda API hujjati `https://127.0.0.1:64443/apidoc.html` da mavjud. **[TASDIQLANDI]** ([Didox: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo))
- **Java asosida:** rasmiy yuklab olish ro'yxati: "Windows JRE 1.8", "Windows JRE 17", "Windows no JRE", "Linux MacOS" (`.tar.gz`), Ubuntu 24 `.deb`, macOS `.dmg` (arm64/amd64); Windows variantlari uchun "antivirus yolg'on ishga tushishi mumkin, istisno qoidasi qo'shing" deb yozilgan; hozirgi versiya v6.4.7. **[TASDIQLANDI]** ([e-imzo.soliq.uz yuklab olish sahifasi, JS bundle `_app-416dee9fd3e191bd.js`](https://e-imzo.soliq.uz/download/); rasmiy havolalar `https://dls.soliq.uz/v6.4.7/E-IMZO-v6.4.7.zip`, `...-jre17.zip`, `...-no-jre.zip`, `...-arm64.dmg`, `...-amd64.dmg`, `...tar.gz`)
- "Java-ilova" ekanligining qo'shimcha tasdig'i: ID-karta ishlashi "посредством установленного Java-апплета E-IMZO" deb tasvirlangan; Windows'da ishga tushmasa — TCP dynamic port diapazoni muammosi (`netsh int ipv4 set dynamicport tcp ...`). **[TASDIQLANDI, ikkilamchi: qo0p]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc))
- Windows o'rnatuvchisi administrator huquqi bilan ishga tushiriladi; o'rnatish tugagach "asosiy sertifikatni yuklash" (root cert) so'raladi — "Да" bosiladi. Keyin brauzerda `https://127.0.0.1:64443/` ochilib, Firefox'da xavfsizlik istisnosi qo'shiladi. **[TASDIQLANDI]** ([e-imzo.soliq.uz/install](https://e-imzo.soliq.uz/install/), [esi.uz E-IMZO yordami](https://esi.uz/index/help/eimzo))
- Tray menyusi bor (ichida "Режим разработчика", "Разработка → Эмулятор ID-карты" kabi bandlar). **[TASDIQLANDI, ikkilamchi: qo0p]**

### 1.2. WebSocket endpoint'lar va portlar

| Endpoint | Qachon | Manba |
|---|---|---|
| `wss://127.0.0.1:64443/service/cryptapi` | sahifa `https:` bo'lsa | rasmiy `e-imzo.js`: `window.location.protocol === "https:" ? "wss://127.0.0.1:64443" : "ws://127.0.0.1:64646"` + `/service/cryptapi` — [test.e-imzo.uz/demo/e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js) **[TASDIQLANDI]** |
| `ws://127.0.0.1:64646/service/cryptapi` | sahifa `http:` bo'lsa (TLS yo'q) | xuddi shu fayl **[TASDIQLANDI]**; Didox'ning o'z JS'ida ham aynan shu mantiq ([didox.uz/index_e82707fb.js](https://didox.uz/index_e82707fb.js)) **[TASDIQLANDI]** |
| `http://127.0.0.1:64646/apidoc.html` va `https://127.0.0.1:64443/apidoc.html` | API hujjati (E-IMZO ishlab turganda) | [Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [qo0p](https://github.com/qo0p/e-imzo-doc) |

- 64443 portidagi TLS sertifikatini **E-IMZO o'zi o'rnatgan root sertifikat** imzolaydi; macOS yuklab olish bo'limida "SSL-сертификат E-IMZO" (`https://dls.soliq.uz/e-imzo-chain.pem`) alohida havola sifatida berilgan. **[TASDIQLANDI]** ([e-imzo.soliq.uz yuklab olish](https://e-imzo.soliq.uz/download/)). Bu Node.js uchun muhim: Node o'z CA ro'yxatidan foydalanadi, OS do'konidan emas → `ca` yoki `NODE_EXTRA_CA_CERTS` bilan shu zanjirni berish kerak bo'ladi **[XULOSA]**; yoki TLS'siz 64646 portidan foydalanish.
- `ws://127.0.0.1:64646` v6 da hamon ochiqmi — Didox'ning hozirgi JS'i va hozirgi `e-imzo.js` hamon unga murojaat qiladi, ya'ni ehtimol ha; ammo v6.4.7 da portni tekshirish **[TEKSHIRILMADI]**.

### 1.3. JSON xabar formati

Har chaqiruv — bitta JSON: `{"plugin": "...", "name": "...", "arguments": [...]}`. Javob — JSON, doim `success: true|false` (xato bo'lsa `reason`). Maxsus xabarlar plugin'siz: `{name: "version"}`, `{name: "apidoc"}`, `{name: "apikey", arguments: [domen1, kalit1, domen2, kalit2, ...]}`. **[TASDIQLANDI]** ([e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js), [e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js))

Muhim: rasmiy `CAPIWS.callFunction` **har chaqiruvga yangi WebSocket ochadi**, bitta javob olgach `socket.close()` qiladi. Ya'ni `keyId` WebSocket ulanishiga emas, **E-IMZO jarayoniga** bog'langan (Didox ham `keyId` ni `sessionStorage` da saqlab, keyingi chaqiruvlarda qayta ishlatadi). **[TASDIQLANDI]** ([e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js); [didox.uz JS: `loadPfxKey`/`getSignature`](https://didox.uz/index_e82707fb.js))

Plugin'lar (rasmiy klientdan): `pfx` (`list_all_certificates`, `load_key`, `verify_password`, `change_password`), `pkcs7` (`create_pkcs7`, `append_pkcs7_attached`, `attach_timestamp_token_pkcs7`), `ftjc`, `idcard`, `baikey`, `ckc`; Didox JS'i qo'shimcha `certkey` plugin'idan ham foydalanadi. **[TASDIQLANDI]** ([e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [didox.uz JS](https://didox.uz/index_e82707fb.js)). Versiya chegaralari: 3.36 (yangi API), 4.12 (idcard), 4.86 (baikey/ckc); demo minimal talab 3.37. **[TASDIQLANDI]** ([e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js))

### 1.4. Rasmiy JS klient va qayerda e'lon qilingan

- Rasmiy demo sayt: [test.e-imzo.uz/demo/](https://test.e-imzo.uz/demo/) — quyidagi fayllar ochiq: `e-imzo.js` (`CAPIWS` + Base64, v2.1.4), `e-imzo-client.js` (`EIMZOClient`: `checkVersion`, `installApiKeys`, `listAllUserKeys`, `loadKey`, `createPkcs7`, `changeKeyPassword`), `e-imzo-init.js` (`AppLoad`, API_KEYS massivi). **[TASDIQLANDI]**
  - `https://test.e-imzo.uz/demo/e-imzo.js`, `.../e-imzo-client.js`, `.../e-imzo-init.js` (bevosita yuklab o'qildi).
- npm'da rasmiy paket yo'q (qidiruvda topilmadi) **[TEKSHIRILMADI]**; uchinchi tomon: `@islom929/react-eimzo` ([npm](https://www.npmjs.com/package/@islom929/react-eimzo)), Python klient [islomN/eimzo_plugin](https://github.com/islomN/eimzo_plugin) (3.3-bo'limga qarang), Dart `e_imzo` ([pub.dev](https://pub.dev/documentation/e_imzo/latest/)). Ularni bog'liqlik sifatida olish tavsiya etilmaydi **[XULOSA]**.

---

## 2. Kirish nazorati (API-KEY, Origin, Node.js)

### 2.1. API-KEY mexanizmi

- **API-KEY — domenga bog'langan satr**; "разрешает странице этого домена вызывать функции локального E-IMZO". Brauzer → lokal E-IMZO (`CAPIWS.apikey`). Kalitni NITs NT beradi, bitta production domen uchun bitta kalit; boshqa domen/subdomen — alohida kalit; IP bo'yicha production kalit berilmaydi. **[TASDIQLANDI, ikkilamchi: qo0p §0.3]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc))
- **`localhost` va `127.0.0.1` uchun tayyor kalitlar mavjud** — rasmiy demoda ochiq e'lon qilingan: [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js) va `e-imzo-client.js` ichidagi `API_KEYS` ("localhost", "127.0.0.1"). Bu kalitlar "faqat lokal sahifa uchun yaroqli". **[TASDIQLANDI]** (kalit qiymatlari bu hujjatga ko'chirilmadi — o'sha ikki fayldan olinadi). Didox'ning o'z JS'i ham xuddi shu `localhost`/`127.0.0.1` juftliklarini + o'z `didox.uz` kalitini yuboradi. **[TASDIQLANDI]** ([didox.uz JS](https://didox.uz/index_e82707fb.js))
- Demo `e-imzo-init.js` da bundan tashqari `'null'` domeni uchun ham kalit bor (Origin `null` — odatda `file://` sahifalar/sandbox'dagi iframe'lar uchun). Bu hujjatlashtirilmagan; Electron `file://` rejimi uchun imkon bo'lishi mumkin. **[TASDIQLANDI faktni; qo'llanilishi — TEKSHIRILMADI]**
- **E-IMZO v6:** "локальное приложение может загрузить API-KEY само по домену открытой страницы. Явный вызов `CAPIWS.apikey` ... нужен для более ранних версий." **[TASDIQLANDI, ikkilamchi: qo0p]** — ya'ni v6 domenni (ehtimol `Origin` dan) o'zi aniqlaydi. **[XULOSA]**
- Test domen/IP uchun kalit o'rniga tray menyusida **"Режим разработчика"** yoqiladi (production domen kalitini almashtirmaydi). **[TASDIQLANDI, ikkilamchi: qo0p]** — bu bizga ham test vaqtida foydali bo'lishi mumkin **[XULOSA]**.

### 2.2. E-IMZO WebSocket `Origin` sarlavhasini tekshiradimi?

- Didox hujjati ulanish sarlavhalari sifatida `Host: 127.0.0.1:64443` va **`Origin: https://{your web site}`** ni ko'rsatadi. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo)). Demak Origin ulanishning rasmiy qismi.
- Domen kalitining mantiqi (domen → kalit) E-IMZO tomonda domenni qayerdan bilishini talab qiladi; brauzer WebSocket'da yagona ishonchli manba — `Origin`. Shuning uchun E-IMZO Origin'ni o'qiydi/tekshiradi deb **ehtimol** aytish mumkin. **[XULOSA]** "Origin tekshiriladi" deb to'g'ridan-to'g'ri yozilgan matn topilmadi. **[TEKSHIRILMADI]**
- Qaysi qiymatlar qabul qilinishi: `http://localhost:<port>` → domen `localhost`; `http://127.0.0.1:<port>` → domen `127.0.0.1` (ikkalasi **boshqa-boshqa** kalit). Portni hisobga olish-olmasligi **[TEKSHIRILMADI]**. **[XULOSA]**

### 2.3. Brauzer bo'lmagan jarayon (Node.js / Electron) ulana oladimi?

- **Uchinchi tomon dalil:** Python klient `islomN/eimzo_plugin` brauzersiz ishlaydi: `websocket.WebSocketApp("ws://127.0.0.1:64646/service/cryptapi", header={"host": "localhost"})`, API_KEYS ichida `localhost`/`127.0.0.1` kalitlari, `list_all_certificates`/`load_key`/`create_pkcs7` ni chaqiradi (1C integratsiyasi uchun). **[TASDIQLANDI faktni]** ([CAPIWS.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/CAPIWS.py), [EimzoClient.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/EimzoClient.py)). Bu **ishlayotganini isbotlamaydi** (qaysi versiyada sinalgani noma'lum). Python `websocket-client` Origin'ni standart bo'yicha `http://127.0.0.1:64646` kabi qo'yadi deb eslayman — **[TEKSHIRILMADI]**.
- Node `ws` kutubxonasi `origin` opsiyasini qo'llab-quvvatlaydi; sukut bo'yicha Origin yubormaydi (**[XULOSA]**, `ws` hujjati: [ws.md](https://github.com/websockets/ws/blob/master/doc/ws.md)). Shuning uchun Node'dan ulanishda `{ origin: 'http://127.0.0.1' }` (yoki `http://localhost`) berish va `Host`/TLS'ni to'g'ri sozlash kerak. TLS server nomiga `host:port` emas, faqat host berilishi kerak (Java bu holatda `illegal_parameter` bilan rad etadi — boshqa klient muallifi xabari, ikkilamchi). **[XULOSA]**
- **Etika/xavfsizlik:** Origin'ni `https://didox.uz` deb **soxtalashtirib, Didox'ning API-KEY'ini ishlatish — tavsiya etilmaydi** (bu uning domen nazoratini aldab o'tish). Faqat `localhost`/`127.0.0.1` ichki kalitlari. **[XULOSA]**
- **Tavsiya etilgan yo'l (ikki variant), 8-bo'limda:** (A) E-IMZO bilan **brauzer sahifasi** gaplashadi (sahifa `http://localhost:PORT` dan beriladi, Origin = `localhost`, standart rasmiy usul); (B) Node backend to'g'ridan-to'g'ri ulanadi (Origin qo'lda). A variant rasmiy ishlatilishga mos va eng kam xavfli. **[XULOSA]**

---

## 3. `.pfx` kalitdan foydalanish

### 3.1. Kalitlar ro'yxati

`{"plugin":"pfx","name":"list_all_certificates"}` → `{"certificates":[{"disk","path","name","alias"}], "success":true}`. `alias` — X.500 satri: `cn, name, surname, o, uid, 1.2.860.3.16.1.2 (PINFL), 1.2.860.3.16.1.1 (yuridik INN), t (lavozim), serialnumber, validfrom, validto`. Yuridik shaxs sertifikatida `...1.1=INN` bor, jismoniy shaxsda faqat PINFL. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [qo0p: OID jadvali](https://github.com/qo0p/e-imzo-doc))

`.pfx` fayllar E-IMZO ko'radigan kalit papkasida turadi. Misolda `"disk":"C:\\"`. macOS qo'llanmasida papka `/Volumes/DSKEYS` (nomi aynan shunday bo'lishi shart) — Windows'dagi aniq papka manbalarda tasdiqlanmadi. **[TASDIQLANDI macOS uchun, ikkilamchi: Gazeta.uz]**; Windows papkasi **[TEKSHIRILMADI]**.

### 3.2. `load_key` — kim parol so'raydi?

- `load_key` argumentlari: `[disk, path, name, alias]` → `{"keyId": "...", "type": "PFX_KEY_STORE", "success": true}`. Parol argumenti **yo'q**. **[TASDIQLANDI]** ([Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [e-imzo-client.js `loadKey`](https://test.e-imzo.uz/demo/e-imzo-client.js))
- **Parolni E-IMZO ilovasining o'zi so'raydi**: "Пароль PFX спрашивает само приложение E-IMZO. Сайт пароль не получает и не может включить запоминание из JavaScript." Oyna `create_pkcs7` chaqiruvida paydo bo'ladi (qo0p ketma-ketlik diagrammasi: `create_pkcs7` → "запрос Пароля" → foydalanuvchi parol kiritadi → E-IMZO yopiq kalitni ochadi). `verify_password(keyId)` ham xuddi shunday oyna ochadi (parolni oldindan tekshirish uchun). **[TASDIQLANDI, ikkilamchi: qo0p §0.1, §1.3]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc)); Didox JS'i xato matni sifatida "BadPaddingException → noto'g'ri parol"ni ko'rsatadi ([e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js)). **→ bizning qoida (parolni ilova so'ramaydi) bajariladi.**

### 3.3. `keyId` umri va bir yuklash bilan bir nechta imzo

(Hammasi ikkilamchi: [qo0p §1.3](https://github.com/qo0p/e-imzo-doc), demo kodiga mos.)
- Har `load_key` **yangi** `keyId` yaratadi; qayta `load_key` — yangi sessiya, parol yana so'raladi.
- `keyId` sessiyasi **24 soat** yashaydi; undan keyin `create_pkcs7` "ключ по идентификатору не найден" deydi → qayta `load_key`.
- Oynada "Запомнить на 6 час." belgisi bor; **sukut bo'yicha o'chiq**, uni faqat foydalanuvchi qo'lda belgilaydi; belgilansa, shu `keyId` bilan keyingi `create_pkcs7` 6 soat parol so'ramaydi. Belgilanmasa — parol shu `keyId` uchun **1 daqiqa** eslab qolinadi.
- Parol E-IMZO **xotirasida** saqlanadi (diskka emas), E-IMZO qayta ishga tushsa yo'qoladi **[XULOSA]**.
- Didox JS'i amalda shunday qiladi: `keyId` ni `sessionStorage[serialNumber]` da saqlaydi; `create_pkcs7` xato bersa — qayta `load_key`. ([didox.uz JS](https://didox.uz/index_e82707fb.js)) **[TASDIQLANDI]**

---

## 4. Didox login uchun imzolash — aniq oqim

### 4.1. Rasmiy Didox hujjatidagi qadamlar

Manba: [Didox: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo) va [03. Логин](https://api-docs.didox.uz/ru/home). **[TASDIQLANDI]**

1. WebSocket: `wss://127.0.0.1:64443/service/cryptapi`, sarlavhalar `Host: 127.0.0.1:64443`, `Origin: https://{sayt}`.
2. `{"plugin":"pfx","name":"list_all_certificates"}` → tanlangan kalitning `disk/path/name/alias`.
3. `{"plugin":"pfx","name":"load_key","arguments":[disk, path, name, alias]}` → `keyId`.
4. `{"plugin":"pkcs7","name":"create_pkcs7","arguments":[ <INN base64>, keyId, "no" ]}` → `{pkcs7_64, signer_serial_number, signature_hex, success}`.
   - Birinchi argument: **INN satri base64'da** (hujjat misoli `MjA3MTE5OTYz` = INN'ning base64'i). Hujjat oqimi ro'yxatida: "Первым аргументом передать инн в base64". Boshqa nonce/challenge yo'q.
   - Uchinchi argument `"no"` = **attached** (ma'lumot PKCS#7 ichiga joylanadi); `"yes"` = detached. (E-IMZO tavsifi: "'yes' — без вложения исходных данных, 'no' или '' — с вложением" — [qo0p §1.2](https://github.com/qo0p/e-imzo-doc)). Didox JS'ining login yo'lida ham detached berilmaydi (`"no"`). **[TASDIQLANDI]**
5. **Timestamp biriktirish:** `POST /v1/dsvs/timestamp`, body `{"pkcs7": <pkcs7_64>, "signatureHex": <signature_hex>}` → `{"timeStampTokenB64": "...", "success": true, "isAttachedPkcs7": true}`.
6. `POST /v1/auth/{INN}/token/ru` (yoki `uz`), body `{"signature": <timeStampTokenB64>}` → `200 {"token": "<uuid>", "related_companies": null|[...], "related_branches": null|[...]}`. Xatolar: `422 User not registered`, `401 Unauthorized. Invalid signature`. Token UUID, **360 daqiqa** amal qiladi. **[TASDIQLANDI]** ([Didox 03](https://api-docs.didox.uz/ru/home))

### 4.2. Timestamp qayerdan olinadi

- **Didox'ning o'z endpoint'i** `/v1/dsvs/timestamp` — TSA'ga o'zi murojaat qiladi. Hujjat tarkibida TSA URL'i yo'q. **[TASDIQLANDI]**
- Didox JS'i bu chaqiruvni `…/v1/dsvs/timestamp` ga yuboradi (prod bazasi `https://api2.didox.uz/v1/dsvs/`); javobda `isAttachedPkcs7` **false** bo'lsa, qo'shimcha E-IMZO chaqiruvi: `{"plugin":"pkcs7","name":"attach_timestamp_token_pkcs7","arguments":[pkcs7_64, signer_serial_number, timeStampTokenB64]}` → `pkcs7_64` (yakuniy). `isAttachedPkcs7 === true` bo'lsa `timeStampTokenB64` o'zi yakuniy imzo. **[TASDIQLANDI]** ([didox.uz JS: `postLoadKey`](https://didox.uz/index_e82707fb.js)). Hujjatdagi misol javobda `isAttachedPkcs7: true`.
- Tarixiy kontekst: E-IMZO'ning o'z serverida (`E-IMZO-SERVER`) bu `/frontend/timestamp/pkcs7`; u NITs NT bilan shartnoma + VPN kaliti (`vpn.e-imzo.uz`, faqat O'zbekistondan ochiladi) talab qiladi. Bizga kerak emas — Didox endpoint'i o'zi qiladi. **[TASDIQLANDI, ikkilamchi: qo0p]** ([qo0p/e-imzo-doc](https://github.com/qo0p/e-imzo-doc)). ⚠ macOS'da (O'zbekistondan tashqarida) test qilinsa, Didox'ning TSA/VPN tomoni ishlashi **[TEKSHIRILMADI]**.

### 4.3. Partner API qismi va veb-ilova qismi

| Qadam | Partner API (rasmiy, token kerak) | Didox veb-ilovasi (didox.uz JS'idan o'qildi) |
|---|---|---|
| 1–4 E-IMZO chaqiruvlari (lokal) | token **kerak emas** (faqat E-IMZO ruxsati) | xuddi shu |
| 5 timestamp | hujjat: "Чтобы использовать API необходимо получить партнерский токен" — `/v1/dsvs/timestamp` ham shu qatorda | `getTimestamp` alohida axios instance, ko'rinadigan token sarlavhasi **yo'q** — `POST …/v1/dsvs/timestamp` **[XULOSA: ehtimol tokensiz ochiq; TEKSHIRILMADI]** |
| 6 login | `POST /v1/auth/{INN}/token/{locale}` + `Partner-Authorization: <PARTNER_TOKEN>` (oddiy matn) | **o'z partner tokeni** (JS ichiga joylangan) `{token, iat}` sifatida **RSA-OAEP bilan shifrlanadi** (JS ichidagi ochiq kalit bilan) va `Partner-Authorization` sifatida yuboriladi; qo'shimcha sarlavha `X-Requested-From: website`; baza `https://api2.didox.uz/v1/` |
| keyingi so'rovlar | `Partner-Authorization` + `user-key: <token>` | `user-key: <token>` + shifrlangan `Partner-Authorization` |

Manbalar: [Didox 03](https://api-docs.didox.uz/ru/home), [Didox 01](https://api-docs.didox.uz/ru/integrators-eimzo), [didox.uz bundle `index_e82707fb.js`](https://didox.uz/index_e82707fb.js) (funksiyalar `signIn`, `rawSignIn`, `authAxios`, `encrypt$1`, `getTimestamp`, `timestamper`). **[TASDIQLANDI faktlar; ularning ma'nosi/huquqiy tomoni — XULOSA]**

**Bu nimani anglatadi (BLOKER-darajadagi xavf):**
- "Veb-ilova ishlatadigan ichki endpoint'larni chaqiramiz" rejasi aslida shuni talab qiladi: Didox'ning JS'idan **uning o'z partner tokeni** va **RSA ochiq kaliti**ni olib, uning shifrlash sxemasini takrorlash. Bu API'dan "norasmiy foydalanish"dan ko'ra jiddiyroq — boshqa tashkilot (Didox) kredensialini ishlatish. Didox tokenni almashtirsa/shifrlash sxemasini o'zgartirsa (JS bundle'da hash'li fayl nomi — `index_aff02a2b.js` → `index_e82707fb.js`, ya'ni tez-tez o'zgaradi), login ishlamay qoladi. **[XULOSA]**
- Tokenni **ilova ichiga ko'chirmaslik** va yashirin saqlamaslik tavsiya etiladi; agar owner baribir shu yo'ldan borsa — bu alohida, ongli qaror (CONSTITUTION'da yozib qo'yish). **Hujjatga token/kalit qiymati ko'chirilmadi.**
- **Tavsiya [XULOSA]:** rasmiy partner token olinmaguncha ERI-login yo'lini "eksperimental" deb belgilash; yoki Didox'dan oddiy kompaniya uchun **parol bilan kirish + shaxsiy API token** imkoniyatini yozma so'rash.

---

## 5. Ko'p kompaniya (`POST /v1/auth/company/{tin}/login/{locale}`)

Rasmiy hujjat ([Didox 03, "Способ 3"](https://api-docs.didox.uz/ru/home)) **[TASDIQLANDI]**:
- Maqsad: "Физическое лицо входит в компанию, используя свой токен (полученный Способом 1 или 2)". Javob: kompaniya tokeni + `permissions`.
- Path: `companyTaxId` (kompaniya INN), `locale` (`ru` sukut/`uz`).
- Sarlavhalar: `Partner-Authorization` (majburiy), **`user-key`** — jismoniy shaxs tokeni (majburiy).
- Body ixtiyoriy: `branchNum` (filial raqami).
- 200 javobi: `{"token": "...", "permissions": {"tin": "<companyTaxId>", "roles": [11,12,21,22,41,42,51,52]}}` (misol).
- Xatolar: `422 Company not registered`, `422 Failed to register company`, `401 Failed to login in company. Reason: ...`.
- Jismoniy shaxs INN/PINFL bilan kirganda (usul 1 yoki 2) javobdagi `related_companies` (INN, nom, vakolat kodlari) va `related_branches` dan kompaniya tanlanadi. ([Didox 03](https://api-docs.didox.uz/ru/home))
- `roles` kodlarining ma'nosi hujjatda tushuntirilmagan **[TEKSHIRILMADI]** (`docs/research/didox.md` ham shuni aytgan).

Veb-ilova mantiqi (didox.uz JS) bilan mos: **yuridik** sertifikat (INN bor) bilan kirilsa — INN imzolanadi va shu INN kompaniyasi tokeni to'g'ridan-to'g'ri olinadi (`signIn`); **jismoniy** sertifikat (faqat PINFL) bilan — PINFL imzolanadi, keyin `related_companies` dan `signInByCompany` bilan kompaniya tanlanadi. **[TASDIQLANDI faktni]** ([didox.uz JS](https://didox.uz/index_e82707fb.js)). Bizning holat: har bir MCHJ ning o'z yuridik ERI'si bo'lsa — `taxId = MCHJ INN`; buxgalter jismoniy ERI bilan bir necha MCHJ'ga vakolatli bo'lsa — bitta imzo + har kompaniya uchun `company/{tin}/login`. **[XULOSA]**

---

## 6. Platforma mavjudligi (macOS va Windows)

### 6.1. macOS

- **macOS uchun rasmiy E-IMZO bor**: "MacOS ARM (Apple Silicon)" — `E-IMZO-v6.4.7-arm64.dmg`, "MacOS AMD64 (Intel)" — `E-IMZO-v6.4.7-amd64.dmg` (MD5 fayllari bilan), shuningdek "SSL-сертификат E-IMZO" (`e-imzo-chain.pem`) va PDF qo'llanmalar `E_IMZO_MacOS_RU.pdf` / `E_IMZO_MacOS_UZ.pdf`. **[TASDIQLANDI]** ([e-imzo.soliq.uz/download](https://e-imzo.soliq.uz/download/), [havolalar sahifa JS'idan](https://e-imzo.soliq.uz/_next/static/chunks/pages/_app-416dee9fd3e191bd.js))
- ⚠ macOS PDF qo'llanma (hajmi 10 MB dan katta) **o'qilmadi**: yuklab olishga ruxsat so'ralmadi. Aniq o'rnatish qadamlari **[TEKSHIRILMADI]**; owner PDF'ni o'zi ochib ko'rishi kerak.
- Eski (2022, yangilangan 2025-01-31) uchinchi tomon qo'llanma — Java JRE 1.8 + `E-IMZO-v4.64.tar.gz` → `E-IMZO.sh`; kalit papkasi `/Volumes/DSKEYS` (sudo bilan yaratiladi); Automator orqali launcher; menyu satrida yashil ikonka; `https://127.0.0.1:64443/` da tekshirish; **Safari bloklaydi — Chrome yoki Firefox**; Chrome'da `E-IMZO.pem` ni "Always Trust" qilish. **[TASDIQLANDI faktni, ikkilamchi]** ([Gazeta.uz](https://www.gazeta.uz/ru/2022/07/26/e-imzo/)). v6.4.7 `.dmg` uchun qadamlar boshqacha bo'lishi mumkin. **[XULOSA]**
- Bizning ilova uchun macOS ahamiyati: faqat **dasturchi sinovi** (owner birinchi macOS'da sinaydi). Production — Windows.

### 6.2. Windows

- Zip variantlari (JRE 1.8 / 17 / JRE'siz); o'rnatuvchi administrator nomidan ishga tushiriladi; root sertifikat so'rovi — "Да"; antivirus istisnosi kerak bo'lishi mumkin. **[TASDIQLANDI]** ([install](https://e-imzo.soliq.uz/install/), [download](https://e-imzo.soliq.uz/download/))
- Windows'da dynamic TCP port diapazoni juda tor bo'lsa E-IMZO ishga tushmaydi (`netsh int ipv4 set dynamicport tcp start=1025 num=64510`, admin huquqi). **[TASDIQLANDI, ikkilamchi: qo0p §4.2]**
- Windows va macOS o'rtasidagi API farqi manbalarda ko'rsatilmagan; protokol bir xil (`/service/cryptapi`). **[XULOSA]**

---

## 7. Qorovulsiz ishga tushirish (har oyning 1-kuni 06:00)

Manbalar nima deydi:
1. Parol **har safar E-IMZO oynasida inson tomonidan** kiritiladi; sayt/chaqiruvchi parolni berolmaydi ham, eslab qolishni yoqolmaydi. **[TASDIQLANDI, ikkilamchi: qo0p §1.3]**
2. "6 soat eslab qolish" faqat shu bilan ishlaydi: (a) inson oynada belgini **qo'lda** qo'ygan, (b) E-IMZO jarayoni to'xtamagan (parol xotirada), (c) `keyId` o'sha bo'lib qolgan (24 soatgacha). Shundan keyin `create_pkcs7` oynasiz ishlaydi. **[TASDIQLANDI, ikkilamchi: qo0p]**
3. Parol belgisiz bo'lsa — 1 daqiqa.
4. Parolni oldindan dasturga berish/yuklash yo'li hujjatlarda **yo'q**; bizning qoida ham uni taqiqlaydi. **[TASDIQLANDI]**
5. Didox tokeni 360 daqiqa yashaydi, uzoq muddatli token yo'q. ([Didox 03](https://api-docs.didox.uz/ru/home)) **[TASDIQLANDI]**

Xulosa: **06:00 da inson yo'q bo'lsa ERI-login amalda bajarilmaydi.** Xavfsiz dizayn **[XULOSA]**:
- 06:00 da faqat hisob-kitob va "tayyor navbat" (Didox'ga yuborilishi kerak bo'lgan qoralamalar ro'yxati) yaratiladi — Didox'ga hech narsa yuborilmaydi.
- Buxgalter ish boshlaganda ilovada "Didox'ga qoralamalarni yuborish" tugmasini bosadi → E-IMZO parol oynasi → login → navbat bo'yicha qoralamalar yaratiladi. Token xotirada ushlanadi (360 daqiqadan oshmaydi).
- Qo'shimcha cheklov: PC yoqilgan, E-IMZO ishga tushgan va kalit papkasi (flesh/disk) ulangan bo'lishi shart. ID-karta/USB-token foydalanuvchilarda token ulangan bo'lishi kerak (`ckc`/`idcard`).
- Login xatosida avtomatik qayta urinish yo'q: `401 Invalid signature`, `422 User not registered`, E-IMZO xatolari — foydalanuvchiga ko'rsatiladi (Konstitutsiya).

---

## 8. Xulosa: bizning ilova uchun tavsiya etilgan oqim

**Variant A (tavsiya): E-IMZO bilan brauzer sahifasi gaplashadi** — rasmiy usul, Origin avtomatik to'g'ri.

1. Ilovaning veb-qismi `http://localhost:<PORT>` (yoki `127.0.0.1`) dan beriladi. Sahifa `e-imzo.js`/`e-imzo-client.js` mantig'ini (o'zimizning kichik nusxamiz, rasmiy fayldan ilhomlanib) ishlatadi: `ws://127.0.0.1:64646` (http sahifa uchun) yoki `wss://127.0.0.1:64443`.
2. `version` → minimal versiya tekshiruvi; `apikey` (E-IMZO v6 da shart emas bo'lishi mumkin) faqat `localhost`/`127.0.0.1` ichki kalitlari bilan.
3. `pfx.list_all_certificates` → ro'yxat, kompaniya INN bo'yicha filtrlash (alias dagi `1.2.860.3.16.1.1` / `uid`), muddati o'tganlarini yashirish.
4. Buxgalter kalitni tanlaydi → `pfx.load_key` → `keyId` (faqat sahifa xotirasida).
5. `pkcs7.create_pkcs7([base64(INN), keyId, "no"])` → **E-IMZO o'zi parol oynasini ochadi** (ilova parolni ko'rmaydi).
6. Sahifa `pkcs7_64` + `signature_hex` ni **mahalliy backend**'ga yuboradi (parol/kalit yo'q).
7. Backend `POST …/v1/dsvs/timestamp` → `timeStampTokenB64`; agar `isAttachedPkcs7 === false` — bu holatda `attach_timestamp_token_pkcs7` E-IMZO'da sahifada bajariladi (yoki shu holat uchun xato).
8. Backend `POST …/v1/auth/{INN}/token/ru {"signature": …}` → `token` (360 daqiqa) — faqat xotirada; ko'p kompaniya bo'lsa `auth/company/{tin}/login` (`user-key`).
9. Backend token bilan faqat **qoralama** yaratadi (`002` create, `sign` chaqirilmaydi). Token tugasa — foydalanuvchiga yangi login so'raladi (avtomatik qayta urinishsiz).
10. Hech qachon: parolni so'ramaslik/saqlamaslik, `.pfx` ni o'qimaslik/nusxalamaslik, `/sign` chaqirmaslik.

**Variant B (Node backend to'g'ridan-to'g'ri E-IMZO'ga ulanadi):** `ws` + `origin: 'http://127.0.0.1'` + (TLS bo'lsa) `ca = e-imzo-chain.pem`. Oqim A bilan bir xil, faqat 1–5 qadamlar backend'da. Afzalligi: UI soddaligi; kamchiligi: Origin/TLS/API-KEY xatti-harakati tasdiqlanmagan — avval hands-on test kerak.

**Birinchi navbatda hal qilinishi kerak bo'lgan qaror:** 4.3-bo'limdagi `Partner-Authorization` muammosi (Didox'ning o'z tokeni). Rasmiy partner token yoki Didox'dan yozma ruxsat bo'lmaguncha 8-bo'limdagi 8–9 qadamlar xavfli/beqaror.

---

## 9. Ochiq savollar — haqiqiy PC'da hands-on test kerak

| # | Savol | Qanday sinash |
|---|---|---|
| 1 | E-IMZO v6.4.7 `ws://127.0.0.1:64646` ni hamon ochadimi? | Windows PC'da `curl`/`wscat` bilan ulanib `{"name":"version"}` yuborish |
| 2 | Origin tekshiriladimi; Origin yo'q (Node `ws` sukut) bo'lsa nima bo'ladi; `http://localhost:3000` va `http://127.0.0.1:3000` (port bilan) qabul qilinadimi? | `ws` bilan: Origin yo'q / `http://127.0.0.1` / `http://localhost:PORT` / `null` — `version`, `apikey`, `list_all_certificates` javoblarini solishtirish |
| 3 | v6 da `apikey` chaqirmasdan ham `localhost` sahifasi ishlaydimi (domenni o'zi yuklaydimi)? | Variant A sahifasidan `apikey`siz `list_all_certificates` |
| 4 | Node'dan 64443 TLS: `e-imzo-chain.pem` bilan ishlaydimi, `rejectUnauthorized` kerakmi? | `ws` + `ca` opsiyasi |
| 5 | Electron `file://` (Origin `null`) ishlaydimi? Demo'dagi `'null'` kaliti prod E-IMZO'da qabul qilinadimi? | Faqat Electron kerak bo'lsa |
| 6 | `create_pkcs7` parol oynasi aynan qanday ko'rinadi; oyna jarayon fonida bo'lsa (ilova ustida) chiqadimi? | Qo'lda, Windows PC |
| 7 | "Eslab qolish 6 soat" belgisi Windows v6 da ham bormi; `keyId` E-IMZO qayta ishga tushsa yo'qoladimi? | 2 ketma-ket `create_pkcs7`, so'ng E-IMZO restart |
| 8 | Bir E-IMZO jarayonida ikkita turli `.pfx` (ikki MCHJ) bir vaqtda `keyId` bilan ishlaydimi? | Ikki `load_key` + ikkita `create_pkcs7` |
| 9 | `/v1/dsvs/timestamp` tokensiz ishlaydimi (api2.didox.uz), partner bazasida (api-partners/testapi3) nima talab qilinadi? Boshqa mamlakatdan (macOS testi) ishlaydimi? | `curl` bilan test muhitida; sarlavhasiz va `Partner-Authorization` bilan |
| 10 | `isAttachedPkcs7` qachon `false` bo'ladi, shunda `attach_timestamp_token_pkcs7` zarurmi? | Bir necha login |
| 11 | `/v1/auth/{INN}/token/ru` **faqat `Partner-Authorization` bilan** ishlaydimi; sarlavhasiz nima qaytaradi (401/403)? Didox ToS tashqarida norasmiy foydalanishni taqiqlaydimi? | Test muhiti + Didox account manager'dan yozma so'rov (Telegram `@Didox_account`) |
| 12 | Yuridik ERI bilan `auth/{INN}/token` ishlaydi, jismoniy ERI bilan `related_companies` qaytadi — bizning MCHJ'larda qaysi turi? | Haqiqiy kalit (egasi roziligi bilan) |
| 13 | macOS v6.4.7 `.dmg`: o'rnatish, `e-imzo-chain.pem` ishonchi, ishga tushish, ikonka, port (rasmiy PDF o'qilmagan) | Owner macOS'da `E_IMZO_MacOS_RU.pdf` bo'yicha |
| 14 | Windows'da kalitlar papkasi va flesh/disk o'zgarganda `list_all_certificates` yangilanishi | Qo'lda |
| 15 | Timestamp/Didox tomoni Didox bundle o'zgarganda (hash'li fayl nomi) bizning oqim sinishi — monitoring kerakmi | Didox `@didoxapiupdates` kanaliga obuna |

---

## 10. Manbalar

Rasmiy / birlamchi:
- [Didox API: 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo) — WebSocket, plugin xabarlari, 4 qadamlik imzo va login oqimi, `/v1/dsvs/timestamp`
- [Didox API: 03. Логин](https://api-docs.didox.uz/ru/home) — 3 usul (ERI, parol, `auth/company/{tin}/login`), 360 daqiqa, xatolar, partner token talabi
- [E-IMZO demo: e-imzo.js](https://test.e-imzo.uz/demo/e-imzo.js), [e-imzo-client.js](https://test.e-imzo.uz/demo/e-imzo-client.js), [e-imzo-init.js](https://test.e-imzo.uz/demo/e-imzo-init.js), [demo sahifa](https://test.e-imzo.uz/demo/) — rasmiy JS klient, portlar, API_KEYS, plugin nomlari
- [e-imzo.soliq.uz — yuklab olish](https://e-imzo.soliq.uz/download/) (platformalar va `dls.soliq.uz` havolalari sahifa JS'idan: [_app-416dee9fd3e191bd.js](https://e-imzo.soliq.uz/_next/static/chunks/pages/_app-416dee9fd3e191bd.js)); [o'rnatish sahifasi](https://e-imzo.soliq.uz/install/); [e-imzo.uz](https://e-imzo.uz/) (soliq.uz'ga yo'naltiradi)
- [esi.uz — E-IMZO yordami](https://esi.uz/index/help/eimzo) — 64443 va root sertifikat
- [didox.uz veb-ilova JS bundle `index_e82707fb.js`](https://didox.uz/index_e82707fb.js) — veb-ilovaning haqiqiy login/imzo/timestamp mantig'i (rasmiy hujjat emas, kuzatuv)

Ikkilamchi:
- [qo0p/e-imzo-doc — Инструкция по интеграции E-IMZO](https://github.com/qo0p/e-imzo-doc) (README: [raw](https://raw.githubusercontent.com/qo0p/e-imzo-doc/master/README.md)) — API-KEY/VPN/SiteID farqi, parol 6 soat qoidasi, `keyId` 24 soat, v6 domen kaliti, Windows port muammosi
- [islomN/eimzo_plugin](https://github.com/islomN/eimzo_plugin) ([CAPIWS.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/CAPIWS.py), [EimzoClient.py](https://raw.githubusercontent.com/islomN/eimzo_plugin/master/EimzoClient.py)) — brauzersiz (Python) E-IMZO klienti, 1C uchun
- [Gazeta.uz: E-IMZO ni macOS'da o'rnatish (2022, yangilangan 2025)](https://www.gazeta.uz/ru/2022/07/26/e-imzo/)
- [ws (Node.js) hujjati — `origin` opsiyasi](https://github.com/websockets/ws/blob/master/doc/ws.md)
- Ichki: `docs/research/didox.md` (partner API, 002 JSON, rate-limit)

O'qib bo'lmadigan / o'qilmagan:
- `https://dls.soliq.uz/E_IMZO_MacOS_RU.pdf` (10 MB dan katta, yuklab olinmadi); `https://127.0.0.1:64443/apidoc.html` (E-IMZO lokal o'rnatilmagan); [infostart.ru/1c/tools/1674319](https://infostart.ru/1c/tools/1674319/) (HTTP 429).


---

<!-- ===== Manba: docs/PROGRESS.md ===== -->

# PROGRESS — Moliyaviy yordam: foiz hisobi

> Jarvis'ning diskdagi miyasi — holat uchun yagona haqiqat manbai.
> Har Jarvis turida birinchi shu fayl o'qiladi.

**Joriy modul:** 8a — ERI kalitlar va parollar (reja tasdiqlangan: docs/plans/M8-didox-drafts.md v2; qurish Opus'da, TDD)
**Oxirgi yangilanish:** 2026-10-12

## Modullar
> Har modul = bitta vertical slice = bitta **user-visible harakat**.

| # | Modul | User-visible harakat | Hajm | Status | Izoh | Qabul sanasi |
|---|-------|----------------------|------|--------|------|--------------|
| 1 | Kirish va firmalar | Buxgalter login qilib, firma qo'shadi va ro'yxatda ko'radi | standard | accepted | FR-1.1–1.3; API unit 12 + e2e 36, web 33 test; brauzerda va haqiqiy Didox fayl bilan tekshirildi | 2026-10-07 |
| 2 | Shartnoma yaratish | Buxgalter ikki firma o'rtasida shartnoma ochadi va ro'yxatda ko'radi | standard | accepted | FR-2.1–2.6; API unit 28 + e2e 57, web 60; brauzerda etalon shartnoma bilan tekshirildi | 2026-10-07 |
| 3 | Operatsiyalar | Buxgalter berildi/qaytarildi/foiz to'landi kiritadi, qoldiq va ogohlantirishni ko'radi | standard | accepted | FR-3.1–3.6; API unit 39 + e2e 72, web 69; brauzerda etalon (qoldiq 45 mln), limit ogohlantirishi, o'chirish tekshirildi | 2026-10-07 |
| 4 | Oylik foiz hisoboti | Buxgalter shartnoma bo'yicha har oy foizini va bo'laklarini ko'radi | complex | accepted | FR-4.1–4.5; yadro BigInt, kunma-kun oracle + 150 tasodifiy shartnoma; API unit 57 + e2e 79, web 73; brauzerda etalon yanvar–oktabr tekshirildi | 2026-10-07 |
| 5 | Stavkani o'zgartirish | Buxgalter yangi stavka kiritadi, u qachondan amal qilishini ko'radi | standard | accepted | FR-5.1–5.5; API unit 64 + e2e 86, web 81; brauzerda 15.03→01.04, retroaktiv ogohlantirish, aprel 16% va o'chirish tekshirildi | 2026-10-07 |
| 6 | Excel eksport | Buxgalter oylik hisobotni .xlsx qilib yuklab oladi | standard | accepted | FR-6.1–6.4; API unit 68 + e2e 91 (fayl qayta o'qilib tiyinigacha solishtiriladi), web 82; haqiqiy fayl dev serverdan yuklab tekshirildi | 2026-10-07 |
| 7 | Oylik faktura ro'yxati | Buxgalter oy uchun tayyorlanadigan fakturalarni (summa, qator nomi) ko'radi va nusxalaydi | standard | accepted | FR-7.1–7.5; API unit 97 + e2e 101, web 95; brauzerda etalon yanvar, nusxalash, belgilash/409/olib tashlash | 2026-10-07 |
| 8 | Didox — brauzerni boshqarib qoralamalar | Buxgalter Didox'ga ERI bilan kiradi, ilova sessiyani boshqarib qoralama yaratadi | complex | pending | **yo'l B** (2026-10-11); real Didox oqimini o'rganish + reja + plan-reviewer | |
| 9a | Lokal PGlite baza | Ilova serversiz lokal fayl-bazada ishlaydi | standard | accepted | PGlite adapter, dastur ichi migratsiya (ledger+rollback+snapshot), persistensiya; e2e PGlite'da ham 110 yashil | 2026-10-12 |
| 9b | Electron qobig'i | Ilova desktop dastur sifatida ochiladi (Didox oynasi, static web) | complex | o'zak accepted | Electron main child-process Nest (efemer port, PGlite), Nest static web+SPA, xavfsiz window, single-instance; qoldi: electron-builder, first-run parol, Windows gate, tray/avtostart(M8) | |
| 10 | Kiritish qulayliklari | Summa yozilayotganda formatlanadi, noto'g'ri sana xato beradi, hisobotda yil filtri | standard | accepted | FR-10.1–10.3; API unit 106 + e2e 105, web 135; brauzerda summa yozish, 1999 yil xatosi, 12/25 yil filtri | 2026-10-11 |
| 11 | Shartnomalar ro'yxati | Buxgalter shartnomalarni qidiradi, filtrlaydi, saralaydi; beruvchi/oluvchi alohida | standard | accepted | FR-11.1–11.4; web 153; brauzerda GAMMA → 2, DELTA AGRO → 2 | 2026-10-11 |
| 12 | Davr hisoboti va Excel | Buxgalter davr tanlab shartnomalar harakatini ko'radi va Excel'ga yuklaydi | complex | accepted | FR-12.1–12.3; API unit 111 + e2e 110 (etalon yanvar–fevral, Excel qayta o'qiladi); brauzerda davr + Excel | 2026-10-11 |

Status: `pending → in-progress → review → accepted`
Hajm: `trivial | standard | complex`

## Keyingi sessiya uchun (2026-10-07 dagi to'xtash nuqtasi)
- **Navbat:** M8 (Didox API) partner token kutmoqda → taklif: **Modul 9** (serverga joylash, `wizard`) — Sir'dan server
  ma'lumotlari (OS, domen, kim boshqaradi) kerak. Token kelsa M8 birinchi.
- M8 uchun tayyor: `invoice_drafts` (contractId × month, amount, didoxDocumentId, draftedAt) — M8 shu jadvalga yozadi;
  `InvoicesService.list` / `monthInterest` (`apps/api/src/invoices/`) — qaysi fakturalar `tayyor` ekanini beradi.
- **Ishga tushirish:** `pnpm dev:api` (3000) va `pnpm dev:web` (5173, `/api` proxy). PostgreSQL lokal:
  `moliyaviy_yordam_dev`, testlar — `moliyaviy_yordam_test`. Dev login — `apps/api/.env` 2-qatordagi izohda.
  Dev bazada etalon shartnoma (№ 1, ALFA SAVDO → BETA TEXNO, 05.01 — 60 mln, 20.01 — 15 mln, 14%).
- **Testlar:** `pnpm test` (unit, api+web), `pnpm test:e2e` (api, `TEST_TODAY` = 2026-10-07, `createTestApp({ today })`).
  Supertest: `agent.post()` argumentlari ichida `await` ishlatmang — ID'larni oldin oling.
  Prisma 7: `migrate dev` client'ni yangilamaydi — keyin `npx prisma generate`.
- **Uslub:** TDD (RED → GREEN), har modulda `code-review` (high) + `ReportFindings`, brauzerda tekshiruv,
  commit — inglizcha Conventional Commits, `Co-Authored-By` siz; modul qabul qilingach `main` ga push.
- **Sir'dan kutilayotganlar:** Didox partner token (mijoz nomidan) — M8 bloker; o'zbek tilidagi Didox faktura
  eksporti namunasi (FR-1.3); server ma'lumotlari — M9.

## Qaror jurnali
- 2026-10-12 — **M8a qisman:** SRS M8 yo'l B ga qayta yozildi; desktop TypeScript'ga o'tdi; E-IMZO qatlami (parseAlias, matchKeys, faqat-o'qish klienti) + IPC qo'riqchisi (origin solishtirish, M3) + `activate` ikkinchi API'ni ochmaydi (M4) + Firmalar sahifasida "ERI kalit" ustuni (faqat desktop). Haqiqiy E-IMZO bilan app ichida tekshirildi. Testlar: desktop 15, web 156, api 124. **Qolgan:** ERI parol ombori + parol dialogi — Claude qurmaydi (Sir qarori kerak)
- 2026-10-12 — **M8 reja tasdiqlandi — Sir.** Qurish Opus sessiyada M8a dan (SRS M8 qayta yozish → desktop TS skelet → `alias.spec.ts`)
- 2026-10-12 — Sir: **06:00 shartli + bildirishnoma** (qulf ochiq, E-IMZO, kalit, idle bo'lsa o'zi; bo'lmasa bildirishnoma + catch-up; "09:00 gacha" SRS'dan olib tashlanadi); **Windows PC M8c dan keyin** → Windows gate M8d da. M8 rejasi gate'ga tayyor
- 2026-10-12 — **M8 reja v2** — plan-reviewer (Sonnet) APPROVE_WITH_CHANGES: 4 blocker (precheck false-positive — 31 kunlik oylar bir xil summa; dublikat spirali → write-ahead + karantin; parol noto'g'ri oynaga — fokus identifikatsiyasi; Electron'da real login spike) + 9 major qabul qilindi; `didox_runs` → userData JSON; Windows spike M8b ga. Sir qarorlari keyingi qatorda
- 2026-10-12 — **M8 reja** (Fable): docs/plans/M8-didox-drafts.md — M8a kalit/parol, M8b avto-kirish, M8c qoralamalar, M8d jadval (Sir: jadval birinchi versiyada; Didox oynasi ko'rinadi; barcha firmalar + tanlash). Topilma: Electron 34 = Node 20, global WebSocket yo'q → `ws`; qoralama ro'yxati `?partner=<STIR>` bilan filtrlanadi, o'chirilganlar `.doc-status--red`
- 2026-10-12 — **E-IMZO avto-parol spike YASHIL** (macOS): Didox "Кириш" → E-IMZO oynasi → skript parolni Keychain'dan o'qib o'zi yozdi → kirildi (Sir tasdiqladi). Windows'da SendInput (Unicode) bilan qayta sinaladi. didox-flow.md §1b
- 2026-10-12 — **Didox forma xaritalandi + sinov qoralamasi** (Sir ruxsati; yaratildi → o'chirildi): raqam/sanasiz saqlanadi; kontragent STIR'dan, MXIK'dan birlik/ҚҚСсиз/imtiyoz 102898 avtomatik; ID — Қоралама ro'yxatidan (UUIDv1); kelib chiqishi qo'lda "Хизмат кўрсатиш". docs/research/didox-flow.md §2–2a
- 2026-10-12 — **Avtomatik kirish: ERI parollari ilovada** (Sir; xavf ongli qabul qilindi — parol+`.pfx` bir joyda → imzolash texnik mumkin). Hash emas — OS shifri (`safeStorage`: DPAPI/Keychain); parol faqat E-IMZO parol oynasiga yoziladi (E-IMZO API parol qabul qilmaydi — apidoc). CONSTITUTION §13 qayta yozildi. Keyingi qadam: macOS spike — E-IMZO oynasiga parolni avtomatik yozish
- 2026-10-12 — **E-IMZO to'g'ridan-to'g'ri** (Sir yo'llanmasi): Node `WebSocket` 64646/64443 ga API-KEY va Origin'siz ulanib `version` + `pfx.list_all_certificates` oldi (v6.4.7). Ilova kalit ro'yxatini E-IMZO'dan oladi, STIR (`1.2.860.3.16.1.1`) bo'yicha firmaga bog'laydi; Didox login'da shu kalitni bosadi. didox-flow.md §1a
- 2026-10-12 — **Kalitni ilova tanlaydi** (Sir): buxgalterda bir nechta firma; u ilovada firmani tanlaydi → ilova Didox login'da kalitni STIR bo'yicha topib kiradi → buxgalter faqat E-IMZO parolini kiritadi → qoralamalar. docs/research/didox-flow.md §1
- 2026-10-12 — Didox xaritalash boshlandi (Sir Chrome'i, read-only): login `/documents/new`→`/login_with_signature`; ERI kalit qidiriladigan ro'yxatdan; **har firma alohida ERI kaliti** (firma tanlash=kalit tanlash, Sir) → to'liq avtonom emas; docs/research/didox-flow.md
- 2026-10-12 — **macOS paket (electron-builder)**: `.resources/{api,web,migrations}` ga staging — `pnpm --prod deploy --legacy` + build-only Prisma tooling (CLI, engines, studio, dev, typescript, effect) tozalanadi (479M→~297M); `main.js` paketlangan yo'llar (`process.resourcesPath`); native `.node` asarUnpack; imzosiz (`mac.identity: null` — Apple Developer ID yo'q, Gatekeeper ogohlantiradi). `.app` (572M, arm64) yig'ildi; paketlangan API resurslaridan login→200, / va /contracts→200 (Prisma/pglite/argon2 paketdan ishlaydi). `spaFallback` `{ root }` bilan mustahkamlandi. pglite+adapter runtime dependency'ga ko'chdi
- 2026-10-12 — Qoldi (9b qadoqlash): dmg target (hozir dir), ikona (default Electron), hajm optimizatsiya (ikki pglite nusxasi, es-toolkit), code signing/notarization (Sir Apple ID bilan), Windows NSIS + durability gate
- 2026-10-12 — **First-run parol** (desktop qatlamida, API o'zgarmadi): birinchi ishga tushishda Electron setup oynasi login+parol so'raydi → argon2id hash + tasodifiy JWT sir `userData/config.json` ga yoziladi (0600) → API shu env bilan ko'tariladi. Tarmoq endpointi yo'q (hijack yo'q). Tiklash: `config.json` o'chirilsa qayta setup (ma'lumot `userData/db` da qoladi). Headless: config save/verify, login to'g'ri→200+cookie, xato→401 tasdiqlandi
- 2026-10-12 — M9b o'zak qabul qilindi; prioritet: M8 (Sir Didox sessiyasini xaritalashi kerak) > first-run parol (solo) > electron-builder — Sir "prioritet bo'yicha"
- 2026-10-12 — **M9b o'zak qurildi:** `apps/desktop` Electron ilovasi API'ni child-process'da (ELECTRON_RUN_AS_NODE, PGlite, efemer PORT=0, userData/db) ko'taradi va xavfsiz oynada (contextIsolation+sandbox, external link bloki) ochadi; Nest statik web'ni SPA fallback bilan beradi (WEB_ROOT); `server-entry.ts` port'ni parent'ga xabar qiladi; single-instance. macOS'da yuklanish + bitta portda /, /contracts(SPA), /api(401), asset(200) tasdiqlandi. Electron 34, express dep qo'shildi; pnpm-workspace allowBuilds: electron. Unit 124. Qoldi: electron-builder qadoqlash+signing, first-run parol oqimi, tray/avtostart(M8), Windows durability/smoke gate
- 2026-10-12 — M9a qabul qilindi — Sir
- 2026-10-12 — **M9a qurildi** (lokal PGlite baza): `PrismaService` DB_DRIVER bilan pg|pglite; dastur ichida migratsiya runner (ledger `_app_migrations`, har migratsiya tranzaksiyada, rollback, "yangiroq baza" himoyasi), migratsiyadan oldin `dumpDataDir` snapshot (CONSTITUTION §5); `bootstrap()` → `server.ts` (import qilinadigan). Butun e2e (110) **PGlite'da ham** yashil; persistensiya + Decimal aniqligi service-level test bilan. Unit 120.
- 2026-10-12 — **M9b eslatma:** `ConfigModule.forRoot` import vaqtida env o'qiydi → Electron main `DB_DRIVER`/`PGLITE_DATA_DIR`/`PGLITE_MIGRATIONS_DIR` ni `server.ts` import qilishdan **oldin** (dynamic import) o'rnatishi shart. Haqiqiy elektr o'chish (fsync) testi Windows gate'da
- 2026-10-12 — Chalkashlik hal: "Prisma'da qolamiz" = PGlite (u Prisma + haqiqiy PostgreSQL, WASM, o'rnatishsiz; SQLite emas). Sir PGlite'ni tasdiqladi; embedded-postgres — zaxira yo'l agar ishonchlilik testi o'tmasa
- 2026-10-12 — **PGlite spike YASHIL** (macOS): 8 migratsiya (CHECK bilan) qo'llandi; `Decimal(18,2)` 99999999999999.99 aniq; `P2002` to'g'ri qaytdi; CHECK manfiyni rad etdi; tranzaksiya rollback; `TRUNCATE … CASCADE` ishladi. Adapter — pglite-prisma-adapter 0.7.2, pglite 0.5.8. Qurish xavfi yopildi; elektr o'chish (hard-reset) testi Windows gate'da qoladi → M9a quriladi
- 2026-10-12 — M9 reja plan-reviewer (Sonnet)dan o'tdi: APPROVE_WITH_CHANGES. Qarorlar: baza **PGlite, lekin avval ishonchlilik (fsync/elektr o'chish) testi**, o'tmasa → embedded-postgres; **macOS'da quramiz, Windows gate keyinga** (dev-only, tarqatishdan oldin Windows'da sinaladi); zaxira (snapshot + pgDump) o'zakka; Nest **child-process**, port **efemer**; modul M9a (baza) + M9b (Electron)ga bo'lindi; tray/avtostart → M8; birinchi qadam — **e2e'ni PGlite'da o'tkazish spike**i — Sir
- 2026-10-12 — B tafsilotlari (Sir): Didox ilovaning **o'z Electron oynasida** ochiladi (BrowserView; buxgalter o'sha yerda ERI bilan kiradi — domen didox.uz, E-IMZO tabiiy ishlaydi); kengaytma yo'li rad etildi. To'ldirish usuli (forma yoki Excel import) real Didox oqimini Sir macOS mashinasida birga ko'rib tanlanadi
- 2026-10-12 — Tartib: **M9-o'zak oldin** (Electron qobig'i + PGlite lokal baza), keyin M8 (brauzerni boshqarish) uning ustiga. Ikkalasi complex → reja + plan-reviewer + gate
- 2026-10-12 — **Didox yo'li: B (brauzerni boshqarish)** — Sir. Buxgalter Didox'ga o'z brauzerida ERI bilan kiradi; ilova ochiq sessiyani boshqarib (forma/Excel) qoralama yaratadi. Didox partner tokenini kodidan sug'urib olish (C) **rad etildi** — uchinchi tomon kalitini o'zlashtirish (CONSTITUTION §14). Spike natijalari: docs/research/e-imzo.md, windows-packaging.md
- 2026-10-11 — ERI kalitlari `.pfx` fayl; barcha buxgalter kompyuterlarida E-IMZO o'rnatilgan; Sir sinovni macOS'da qiladi — Sir
- 2026-10-11 — **Yo'l o'zgardi:** Didox'ga rasmiy ulanib bo'lmaydi → ilova har buxgalter Windows kompyuteriga alohida o'rnatiladi; Didox'ga ERI (E-IMZO) bilan kirib, veb-ilovaning ichki API'si orqali qoralama yaratiladi (variant C; A — Excel import, B — brauzer avtomatlashtirish rad etildi). CONSTITUTION §12–16 qayta yozildi; xavflar ongli qabul qilindi — Sir
- 2026-10-11 — M11 va M12 qabul qilindi — Sir
- 2026-10-11 — M11+M12 tez yopiladi: oraliq gate'larsiz, bitta umumiy Acceptance Report (Sir). M12 complex bo'lsa ham alohida plan-reviewer o'tkazilmadi — o'rniga etalon e2e + code-review (high)
- 2026-10-11 — M12: `GET /reports/period?from&to` (raqamlar), `POST /reports/period.xlsx` (ekrandagi shartnoma ID'lari, ekran tartibida); davr — butun oylar, joriy oy bugungacha; filtr/qidiruv/saralash — klientda, manzilda saqlanadi; qator bosilsa shartnoma ochiladi
- 2026-10-11 — M10 qabul qilindi; summa maydondan chiqqanda `,00` qo'shilmaydi (yozish paytida formatlanadi); kasrdan keyin 3 raqam — minglik — Sir
- 2026-10-09 — Yangi modullar 10–12 (Sir talablari): davr = butun oylar, "davr harakati" (ichida berildi/qaytarildi/foiz, oxiriga qoldiq/qarz); filtr — panel + ustun saralash; sana xatosi — mavjud bo'lmagan sana va 2000–2100 dan tashqari yil; davr Excel — ekrandagidek bitta varaq + jami — Sir
- 2026-10-09 — FR-1.2: manzil, р/с, MFO ixtiyoriy (majburiy faqat nom + STIR); to'ldirilmagan firma "Rekvizitlar to'liq emas" belgisi bilan, Didox importi to'ldiradi. Sir bergan 92 firma ro'yxati dev bazaga nom + STIR bilan qo'shildi (nomlar ro'yxatdagidek) — Sir
- 2026-10-07 — M7 qabul qilindi — Sir
- 2026-10-07 — M7: `GET /invoices` (oy + barcha beruvchilar + qatorlar), `PUT/DELETE /invoices/:month/:contractId/draft`; qayta belgilash — 409 ALREADY_DRAFTED; faqat tugagan oy va foiz > 0; oy summasi yadroda oy oxirigacha hisoblanadi; nusxalash — Clipboard API + execCommand zaxirasi
- 2026-10-07 — M7 reja: `invoice_drafts` jadvali (faqat qoralama holati; `tayyor` = yozuv yo'q), belgilash paytidagi summa saqlanadi va farq qilsa ogohlantirish; summa nusxasi `552328.77`; Didox ID ixtiyoriy; alohida "Fakturalar" sahifasi — Sir
- 2026-10-07 — Kunlik hisob, **B qoidasi** (kun oxiridagi qoldiq; berilgan kun hisobga kiradi) — Sir tanlovi
- 2026-10-07 — Oddiy foiz, penya yo'q; muddatdan keyin qarz qolsa foiz davom etadi — Sir
- 2026-10-07 — Limit = jami berilgan summa; qaytarish limitni tiklamaydi — Sir
- 2026-10-07 — Stavka: 1-sanada o'zgarsa shu oydan, aks holda keyingi oy 1-sanasidan — Sir
- 2026-10-07 — Ichki hisob yaxlitlanmaydi; oy yakuni 2 xonaga yaxlitlanadi (faktura/Excel) — Sir rozi
- 2026-10-07 — Oyni yopish/bloklash yo'q; hisob doim qayta hisoblanadi — Sir
- 2026-10-07 — Ko'p beruvchi × ko'p oluvchi; bitta umumiy login, rollar yo'q, hamma hammasini ko'radi — Sir
- 2026-10-07 — Ogohlantirish bloklamaydi — Sir
- 2026-10-07 — Didox: faqat qoralama, imzo buxgalter qo'lida — Sir
- 2026-10-07 — Server'da joylashadi; loyiha `~/codeLab/moliyaviy-yordam` — Sir
- 2026-10-07 — **SRS tasdiqlandi**; UI faqat o'zbek (lotin) — Sir
- 2026-10-07 — Faktura namunasi olindi: "Счет-фактура без акта", 1 qator, MXIK 10401999001000000, Без НДС; amaldagi hisob 365 kunlik asosda (tasdiqlangan) — SRS §9.1
- 2026-10-07 — Haqiqiy firma rekvizitlari repo'ga yozilmaydi — maxfiylik
- 2026-10-07 — Har MCHJ'ning o'z Didox login'i, kirish ERI (.pfx) bilan — Sir
- 2026-10-07 — Didox spike: rasmiy partner API, qoralama imzosiz, parol bilan kirish mumkin → taklif: API yo'li — docs/research/didox.md
- 2026-10-07 — **Didox yo'li: brauzer kengaytmasi** (API/partner token, Excel юклаш, lokal ilova, cookie — rad etildi; SRS §9.2). Eski Modul 7 → 7 (faktura ro'yxati) + 8 (kengaytma); deploy → 9 — Sir
- 2026-10-07 — **Didox yo'li qayta ko'rildi → partner API** (kengaytma bekor). Firma Didox akkaunt paroli shifrlangan saqlanadi, ERI hech qachon — Sir
- 2026-10-07 — Didox: avtomatik — oy 1-kuni ilova akkauntlarga (1 akkaunt → ko'p firma) kiradi va barcha qoralamalarni yaratadi; ilovada tasdiq yo'q; buxgalter Didox'da raqam/sana qo'yib birdaniga imzolaydi. Partner token mijoz nomidan, Sir so'raydi — Sir
- 2026-10-07 — Avtomatik qoralamalar oy 1-kuni 09:00 gacha tayyor (start 06:00, vaqtinchalik xatolarga 07:00/08:00 qayta urinish); xabar faqat ilovada — Sir
- 2026-10-07 — M6 qabul qilindi — Sir
- 2026-10-07 — M6: `GET /contracts/:id/report.xlsx` (exceljs, serverda, hisobot natijasidan); 3 varaq; summalar raqam `#,##0.00`, 15 xonadan uzuni matn
- 2026-10-07 — M6 reja: summalar raqam (15 xonadan uzuni matn); 3 varaq (Oylik hisobot, Bo'laklar, Operatsiyalar); barcha shartnomalar eksporti — yo'q; kutubxona exceljs — Sir
- 2026-10-07 — M5 qabul qilindi — Sir
- 2026-10-07 — M5: `/contracts/:id/rates` (POST qo'shish, PATCH faqat boshlang'ich qiymati, DELETE boshlang'ichdan boshqasi); RETROACTIVE ogohlantirish — 409 + confirmWarnings; boshlanish sanasi stavka o'zgarishlaridan oldin qolishi shart; ogohlantirish UI umumiy `ConfirmWarnings`
- 2026-10-07 — M5 reja: boshlang'ichdan boshqa o'zgarishni o'chirish (tahrir yo'q); o'tgan/kelajak sana mumkin, tugagan oyga tushsa ogohlantirish; boshlang'ich stavka qiymatini tuzatish (ogohlantirish bilan); yangi o'zgarish boshlang'ichdan keyin amal qiladi — Sir
- 2026-10-07 — M4 qabul qilindi — Sir
- 2026-10-07 — M4: yadro `apps/api/src/interest/engine.ts` (BigInt, bo'laklar, oyiga bitta bo'lish); oy oxirgi kunida ham "joriy" (partial = to === bugun); INTEREST_OVERPAID har bir foiz to'lovi uchun tekshiriladi (asosiy qarz tahriri ham ushlanadi); e2e'da Clock qat'iy (TEST_TODAY)
- 2026-10-07 — M4 reja tasdiqlandi: joriy oy "bugungacha"; hamma hisob `sana ≤ bugun` (CR-11), kelajak operatsiya — rejalashtirilgan; hisobot boshlanish→joriy oy; foiz qarzi ro'yxatda tugagan oylar bo'yicha; foiz yadrosi BigInt (CONSTITUTION §7 yangilandi); yaxlitlash yarmi noldan uzoqqa (CR-4) — Sir
- 2026-10-07 — M3 qabul qilindi — Sir
- 2026-10-07 — M3: `operations` (Decimal, amount > 0 CHECK); hisob mantiqi sof `ledger` modulida (balans, jamilar, ogohlantirishlar); ogohlantirish → 409 CONFIRMATION_REQUIRED, `confirmWarnings: true` bilan saqlanadi; qabul qilingan ogohlantirish o'zgarmagan tahrirda qaytarilmaydi
- 2026-10-07 — M3 reja: ogohlantirish forma ichida + "Baribir saqlash"; manfiy qoldiqqa **manfiy foiz** (CR-10); "foiz to'lovi > foiz qarzi" M4 ga — Sir
- 2026-10-07 — M2 qabul qilindi — Sir
- 2026-10-07 — M2: `contracts` + `rate_changes` (boshlang'ich stavka = tarixning 1-yozuvi, start/imzo sanasi o'zgarsa u ham ko'chadi); pul/stavka API'da string, DB CHECK constraint'lar; "bugun" — Asia/Tashkent (Clock)
- 2026-10-07 — M2 reja: qarz ustunlari M3/M4 da; raqam juftlik ichida unikal; tahrir — raqam/sana/limit/muddat, tomonlar operatsiyagacha; stavka faqat M5 — Sir
- 2026-10-07 — M1 qabul qilindi; repo: github.com/Will-Marco/moliyaviy-yordam (private) — Sir
- 2026-10-07 — M1 ga FR-1.3 qo'shildi: firmalarni Didox faktura fayllaridan import (preview → tasdiq), alohida modul emas — Sir
- 2026-10-07 — M1 stack: pnpm monorepo; NestJS 12 (ESM, Vitest 4), Prisma 7 (adapter-pg), React 19 + Vite 8 + shadcn (radix-nova) + TanStack Query + RHF/zod; TS 6
- 2026-10-07 — M1 auth: bitta login (argon2id hash `.env`'da), sessiya — httpOnly SameSite=Lax cookie'dagi JWT (12 soat); login limiti — IP bo'yicha faqat muvaffaqiyatsiz urinishlar (5/daq), `TRUST_PROXY` bilan real IP
- 2026-10-07 — Dizayn tizimi: design/DESIGN-SYSTEM.md (ui-ux-pro-max: Data-Dense Dashboard, blue-800 + slate, Fira Sans/Code)
- 2026-10-07 — Mijoz suhbati: faktura qatori doimiy (faqat oy va narx o'zgaradi); faktura raqami/sanasini buxgalter Didox'da qo'yadi; ilova faqat qoralama yaratadi — SRS §9.1–9.2

## Ochiq risk / texnik qarz
- M9b qadoqlash: `pnpm --prod deploy` repo'dagi `node_modules/.pnpm-workspace-state-v1.json` ga `"dev": false` yozadi → keyingi har `pnpm run` "install --production" qilib yiqiladi (commit hook ham). Vaqtincha: `pnpm install --frozen-lockfile`. Tuzatish: qadoqlash skriptidan keyin holatni tiklash yoki deploy'ni alohida papkada qilish
- **Didox ichki API** (2026-10-11): akkaunt bloklanishi, Didox o'zgartirsa ogohlantirishsiz buzilish, foydalanish shartlariga ziddlik — Sir qabul qilgan. Har chaqiriq javobi tekshiriladi, kutilmagan javobda to'xtaladi
- E-IMZO har kirishda ERI parolini o'z oynasida so'raydi → oy 1-kuni 06:00 to'liq avtomatik ishga tushish **bo'lmasligi** mumkin (spike'da tekshiriladi)
- Har buxgalterda alohida baza → zaxira nusxa va ilovani yangilash har kompyuterda (M9)
- M7: `552328.77` summa formati haqiqiy Didox formasida tekshirilmagan
- Global query `retry` 400 xatolarni ham 2 marta qayta uradi (sekin xato ko'rsatish) — 4xx'da retry'ni o'chirish mumkin
- Bog'liqliklar auditi: prisma ichidagi mysql2 (ishlatilmaydi), deepmerge-ts; shadcn CLI (web dependencies'da — devDependencies'ga o'tkazish kerak); exceljs → uuid (moderate, bizda ishlatilmaydigan yo'l). Prod deploy (M9) oldidan qayta ko'rib chiqiladi
- M6: Excel tugmasi oddiy havola — sessiya tugagan bo'lsa JSON xato fayli yuklanadi (kam uchraydi)
- M4: ro'yxat har so'rovda har shartnoma uchun to'liq yadroni ishlatadi — yuzlab shartnomada yetarli; ko'paysa yengil "faqat jamilar" rejimi yoki kesh
- M4: operatsiyani o'chirish ogohlantirishsiz (tasdiq oynasi bor) — o'chirish foiz to'lovini ortiqcha qilib qo'yishi mumkin
- M1 FR-1.3: o'zbek (kirill) tilidagi Didox eksport yorliqlari haqiqiy fayl bilan tekshirilmagan — o'zbekcha eksport namunasi kerak
- M1: logout JWT'ni bekor qilmaydi (12 soat amal qiladi) — bitta umumiy login uchun qabul qilingan; kerak bo'lsa token versiyasi bilan yopiladi
- M1: web bundle bitta chunk (>500 kB) — modullar ko'payganda route-level lazy import
- M1: Create/Update company DTO qoidalari takrorlangan — keyingi DTO'lar ko'payganda umumiy helper
- Partner token hali yo'q — Modul 8 bloker (Modul 1–7 bunga bog'liq emas)
- API'da bo'sh `FacturaNo`/`FacturaDate` qabul qilinishi va "Без НДС" `LgotaId` — test muhitida tekshiriladi
- Serverda firma Didox parollari (shifrlangan) — server xavfsizligi muhim; parol bilan imzolab bo'lmaydi [xulosa]
- Didox login: 25 noto'g'ri urinish → doimiy blok — avtomatik qayta urinish taqiqlangan
- Bitta umumiy login — barcha firmalar ma'lumoti hammaga ochiq (Sir ongli qabul qilgan)

