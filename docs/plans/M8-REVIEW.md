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
