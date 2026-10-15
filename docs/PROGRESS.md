# PROGRESS — Moliyaviy yordam: foiz hisobi

> Jarvis'ning diskdagi miyasi — holat uchun yagona haqiqat manbai.
> Har Jarvis turida birinchi shu fayl o'qiladi.

**Joriy modul:** 13 — Umumiy server (reja qabul qilindi 2026-10-15; 13a uchun Sir'dan domen va tashqi zaxira joyi kerak)
**Oxirgi yangilanish:** 2026-10-15

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
| 8 | Didox — brauzerni boshqarib qoralamalar | Buxgalter Didox'ga ERI bilan kiradi, ilova sessiyani boshqarib qoralama yaratadi | complex | accepted | reja v2 (docs/plans/M8-didox-drafts.md); **M8a accepted 2026-10-12** (E-IMZO kalitlar, Firmalar'da ERI ustuni); FR-8.2 parol ombori (safeStorage) + M8b avto-kirish/"Kirishni tekshirish" qurildi; **M8c spec v5 Sir gate'idan o'tdi (2026-10-13)**, **c0 qabul qilindi (2026-10-13)** (SRS deltalari, `api/jwt`+`api/client`, `didox/money`+`parse`+`journal`+`skips`, `engine` (qulf/heartbeat/kritik bo'lim), `Page` kengayishi, `run.ts` refaktor — desktop 331 test, api 130+125 e2e, typecheck toza); keyin spike S1–S7 → c1 (1 faktura gate) → c2 ; **Windows gate W1–W5 o'tdi (2026-10-15)** — `docs/plans/M8d-windows-gate.md` | 2026-10-15 |
| 9a | Lokal PGlite baza | Ilova serversiz lokal fayl-bazada ishlaydi | standard | accepted | PGlite adapter, dastur ichi migratsiya (ledger+rollback+snapshot), persistensiya; e2e PGlite'da ham 110 yashil | 2026-10-12 |
| 9b | Electron qobig'i | Ilova desktop dastur sifatida ochiladi | complex | o'zak accepted | Electron 44, child-process Nest (PGlite), first-run parol, macOS qadoqlash (dir), kunlik zaxira, `productName`; **qoldi:** Windows NSIS (A1), imzolash; A2 Windows gate o'tdi (2026-10-15); A3 qo'lda yangilash (qaror); dmg/ikona/hajm bajarildi (A5) | |
| 10 | Kiritish qulayliklari | Summa yozilayotganda formatlanadi, noto'g'ri sana xato beradi, hisobotda yil filtri | standard | accepted | FR-10.1–10.3; API unit 106 + e2e 105, web 135; brauzerda summa yozish, 1999 yil xatosi, 12/25 yil filtri | 2026-10-11 |
| 11 | Shartnomalar ro'yxati | Buxgalter shartnomalarni qidiradi, filtrlaydi, saralaydi; beruvchi/oluvchi alohida | standard | accepted | FR-11.1–11.4; web 153; brauzerda GAMMA → 2, DELTA AGRO → 2 | 2026-10-11 |
| 12 | Davr hisoboti va Excel | Buxgalter davr tanlab shartnomalar harakatini ko'radi va Excel'ga yuklaydi | complex | accepted | FR-12.1–12.3; API unit 111 + e2e 110 (etalon yanvar–fevral, Excel qayta o'qiladi); brauzerda davr + Excel | 2026-10-11 |
| 13 | Umumiy server | Barcha buxgalterlar bitta ma'lumotni ko'radi; desktop — serverga mijoz + Didox roboti | complex | in-progress (13a lokal tayyor) | `docs/plans/M13-shared-server.md` v2; 13a server muhiti → 13b ko'chish (bir qadamda) → 13c umumiy bayroqlar. **13a (2026-10-15):** `deploy/` (compose: postgres + migrate + api + caddy), `deploy.sh` (snapshot → build → migrate), `pg-backup.sh` / `restore-test.sh`, `docs/runbooks/server-setup.md`; lokal (colima) sinaldi — https/Secure cookie, login cheklovi proxy ortida, zaxira → bo'sh bazaga tiklash, redeploy, dump'dan tiklash. **P1–P5 (2026-10-15, `main`):** P1 "e'tibor kerak" bayrog'i shakli (web `needsCheck` kutardi — belgi hech qachon ko'rinmas edi); P2 server o'qilmasa/belgi yozilmasa firma to'xtaydi, 401 — butun run; P3 jadvalning `NOTHING_TO_DO` urinishi yoziladi (oy yopiladi); P4 API `didox_invoice_flag` + `/api/didox-flags` + `ROBOT_SECRET`; P5 `apps/api/scripts/migrate-data.ts` (export → psql → verify; Mac'dagi haqiqiy ma'lumot bilan lokal serverda: farq 0, qayta yuklash rad etildi). **Qoldi:** P6 desktop → server mijozi (`m13b` branch, ko'chish kuni). **Kutilmoqda:** VPS, domen, tashqi zaxira joyi (Sir) | |

Status: `pending → in-progress → review → accepted`
Hajm: `trivial | standard | complex`

## Keyingi sessiya uchun (2026-10-12 dagi to'xtash nuqtasi)
- **Reja (Sir, 2026-10-12): Windows'ga bog'liq ishlar keyinga** (A1 NSIS o'rnatgich, A2 Windows gate — Windows PC
  bo'lganda). Navbat prioritet bo'yicha:
  1. ~~B1 — Didox Excel importi~~ — **bekor (Sir, 2026-10-12): kerak emas, ortiqcha murakkablik.** Ilova maqsadi — foizni aniq
     hisoblash, qoldiqlar, Excel hisobot; Didox uchun ma'lumot M7 Fakturalar sahifasida (nusxalash + belgilash) yetarli.
  2. A3 — qaror: qo'lda yangilash (Sir). A5 bajarildi (2026-10-12).
  3. Past: logout JWT bekor qilish, company DTO helper, ko'p shartnomada tezlik.
- **M8 holati:** M8a accepted; FR-8.2 parol ombori + M8b ("Kirishni tekshirish") qurilgan (M8b real gate Electron 44 da hali
  o'tmagan — M8c-spec S1). **M8c: spec v5 — `docs/plans/M8c-spec.md` (yagona manba), Sir tasdiqladi (2026-10-13).**
  **c0 qurildi va qabul qilindi (2026-10-13)** (quyidagi qaror jurnaliga qara). Keyingi qadam — **spike S1–S7 Sir bilan,
  real Didox** (kodsiz, DevTools):
  **spike bajarildi (2026-10-13) — `docs/research/didox-flow.md §2c`**; keyingi qadam — c1 bitta faktura
  (`DIDOX_MAX_INVOICES=1`, gate) → c2 ko'p faktura/tiklash/UI (gate).
  API tayyor: `PUT /invoices/:month/:contractId/draft` (`source`, `expectedAmount` majburiy, 409 AMOUNT_CHANGED/CONFIRMATION_REQUIRED/DRAFT_CHANGED).
- **Ishga tushirish:** web `pnpm dev:api` (3000) + `pnpm dev:web` (5173, band bo'lsa launch.json autoPort); desktop
  `pnpm dev:desktop` (tsc + electron; ma'lumot `~/Library/Application Support/Moliyaviy yordam`). Dev login —
  `apps/api/.env` 2-qatordagi izohda. Qadoqlash: `pnpm --filter desktop pack:mac` (dev holati endi buzilmaydi).
- **Testlar:** `pnpm test` (api+web+desktop unit), `pnpm test:e2e` va `pnpm --filter api test:e2e:pglite`.
  Supertest: `agent.post()` argumentlari ichida `await` ishlatmang. Prisma 7: `migrate dev` dan keyin `npx prisma generate`.
  `formatTiyin`/`formatMoney` mingliklarni NBSP (`\u00a0`) bilan ajratadi — test matnlarida hisobga oling.
- **Uslub:** TDD, seam'lar Sir bilan kelishiladi; har ishdan keyin `code-review` (high) + `ReportFindings`, brauzerda
  tekshiruv; commit inglizcha, `Co-Authored-By` siz; tayyor ishlar `main` ga push.
- **Sir'dan kutilayotganlar:** o'zbekcha Didox eksport namunasi (FR-1.3); Windows PC (A2);
  ildizdagi commit qilinmagan `M8b-macOS/` va `docs/M8-toplam.md` taqdiri.

## Qaror jurnali
- 2026-10-15 — **M13 (umumiy server) rejasi v2 qabul qilindi — Sir.** Qo'shimcha qarorlar: (1) Didox roboti **faqat
  desktop'ning o'zidan** (tray yoki lokal oyna) boshlanadi, serverdagi sahifa holatni faqat ko'rsatadi (CONSTITUTION §13);
  (2) **har ERI kaliti faqat bitta kompyuterda** — oy qulfi jadvali qilinmaydi. CONSTITUTION §5/§13/§16 + Tech stack va
  SRS §2/§6/§7, FR-8.7, FR-8.10, Modul 9 izohi, yangi Modul 13 yangilandi. A1 (Windows o'rnatgich) M13 dan keyin —
  desktop roli o'zgaradi (lokal baza yo'q, server manzili so'raladi). 13a dan oldin Sir'dan: domen, tashqi zaxira joyi, VPS
- 2026-10-15 — **Windows gate (M8d) o'tdi, M8 qabul qilindi — Sir ("barchasi muvoffaqiyatli").** Sinov UTM'dagi
  Windows 11 ARM64 VM'da (E-IMZO v6.4.7 `jre17`, x64 Java emulyatsiyada), dev rejimi: W1 o'rnatish/qurish, W2 sinov
  ma'lumoti (API orqali), W3 Didox oynasi ko'rinib — "Kirishni tekshirish" + qoralama (МХИК to'ldi), W4 oyna
  ko'rinmay — qoralama 27 s da, W5 tray (chap/o'ng bosish, yopilganda tray'da qolish), jadval o'zi ishga tushdi,
  bildirishnoma chiqdi. Gate ikki xatoni topdi, tuzatildi (`ddf2bb5`): (1) typist `[ushort]` ishlatgan — Windows
  PowerShell 5.1 da yo'q, birinchi belgida yiqilib "interrupted" berardi; endi `[uint16]` + PS 5.1 da yo'q tur
  nomlariga test; (2) "Кириш" arm'dan 300 ms keyin bosilardi — `powershell.exe` 1 s+ da ko'tariladi, dialog
  typist qaramasdan ochilib "allaqachon ochiq" bo'lardi; endi typist `READY` chiqaradi va login shundan keyin
  bosadi (macOS ham — Mac'da real E-IMZO bilan "Kirishni tekshirish" `typed`, 2026-10-15). Runbook: `Set-ExecutionPolicy` qadami; Electron
  44 binary'ni `pnpm install` emas, birinchi `pnpm dev:desktop` yuklaydi (`60a787a`). Sir: Didox'da sinov
  qoralamalari faqat zarur bo'lganda — W5 jadvali qoralama belgisi qoldirilib (`NOTHING_TO_DO`) Didox'siz sinaldi.
  Ma'lum: desktop'ning 4 testi Windows'da yiqiladi (POSIX fayl ruxsati, yo'l ajratuvchisi) — ilova kodi emas, testlarning o'zi
- 2026-10-14 — **Sir qarorlari: A varianti bekor, asosiysi — Windows.** (1) Didox'ga parol bilan kirish **amalga
  oshirilmaydi** (buxgalterda bunday imkon yo'q) — ya'ni ERI kaliti bilan kirish yagona yo'l va E-IMZO parol oynasi
  har kirishda qisqa vaqt ekranda ko'rinadi; (2) macOS'da bildirishnoma ishlamasligi **qabul qilindi** (tray yetarli);
  (3) **ishlash kerak bo'lgan tizim — Windows**. Shunga ko'ra qurildi: `autotype/win32.ts` + `powershell.ts` —
  PowerShell `SendInput` + `KEYEVENTF_UNICODE` (klaviatura tartibiga bog'liq emas, shuning uchun Windows'da "layout"
  tekshiruvi yo'q; Accessibility kabi ruxsat ham kerak emas), parol faqat **stdin** orqali, exit kodlari macOS
  bilan bir xil; umumiy qism `autotype/typist.ts` ga ajratildi (ikki nusxa nozik mantiq bo'lmasin).
  Qo'shimcha: `app.setAppUserModelId` (Windows bildirishnomasi uchun shart), `pack:win` + NSIS konfiguratsiyasi,
  Firmalar sahifasidagi "faqat macOS" to'sig'i olib tashlandi (endi macOS **va** Windows). Testlar: desktop 495,
  web 196, api 130. **Tekshirilmagan:** PowerShell skriptining o'zi — Windows PC kerak (M8d gate)
- 2026-10-14 — **Qadoqlangan ilova tekshiruvi (M8d va'dalari).** `pack:mac` bilan yig'ilgan `.app` Sir tomonidan
  Finder'dan ochildi: **tray ishladi** va kutayotgan oy uning menyusida ko'rindi; **bildirishnoma chiqmadi**
  (imzosiz ilova — macOS uni bildirishnoma markaziga qo'ymaydi; SRS FR-8.10 ga izoh qo'shildi). Accessibility
  ruxsati **so'ralmadi**, chunki `ready()` birinchi shartda ("foydalanuvchi band") to'xtaydi — ya'ni ruxsat faqat
  haqiqiy urinish paytida, buxgalter kompyuterdan uzoqda bo'lganda so'raladi va **ko'rilmay qolishi mumkin**.
  Taklif (Sir qaroriga): ruxsatni birinchi ishga tushirishda yoki Firmalar sahifasida oldindan so'rash
- 2026-10-14 — **M8d (macOS) qurildi va real sinovdan o'tdi.** Oy 1-kuni 06:00 (Toshkent) tugagan oy uchun ilova
  o'zi urinadi — faqat buxgalter klaviaturadan uzoq bo'lsa (3 daq harakatsizlik), ekran qulfsiz, E-IMZO ishlasa va
  ruxsatlar bo'lsa; aks holda oy "kutmoqda" deb belgilanadi (07:00/08:00 da va keyin soatiga bir marta qayta
  qaraladi, uyg'onish/qulf ochilishida ham). Didox'ga yetib borgan urinish oyni **yopadi** (topilgan muammo —
  odamniki), uch urinishdan keyin jadval to'xtaydi. Ilova tray'da yashaydi, qadoqlangan versiyada tizim bilan
  ishga tushadi. **Gate (Sir mashinasida, hech narsa bosilmadi):** sentabr "qarz" holatiga qaytarildi → ilova
  o'zi run boshladi va 14 s da tugatdi; Didox'da kechagi ikki sinov qoralamasi turgani uchun **yangi qoralama
  yaratmadi**, ikkala fakturani `SIMILAR_DRAFT_EXISTS` bilan "e'tibor kerak" qildi — ya'ni jadval ham,
  takrorlanishdan himoya ham bir vaqtda tasdiqlandi. **Topilma:** macOS imzosiz dev ilovadan **bildirishnomani
  rad etadi** (`UNErrorDomain error 1`), shuning uchun kutayotgan oy tray tooltip/menyusiga ham yoziladi;
  qadoqlangan ilovada bildirishnoma ishlashini qadoqlash gate'i tekshiradi. **Dev eslatmasi:** Accessibility
  ruxsati jarayonni **ishga tushirgan** ilovaga bog'lanadi (terminal), shuning uchun jadval sinovi Sir terminalidan
  o'tkazildi; `DIDOX_SCHEDULE_CHECK_MS` — sinov uchun tekshiruv oralig'i. Testlar: desktop 479, web 195, api 130
- 2026-10-13 — **M8c c2 GATE O'TDI.** Sir ilovadan ishga tushirdi: **2 ta qoralama yaratildi** (№ 12/25, 13/25),
  kalitsiz firma (SINOV BERUVCHI) "E-IMZO kaliti topilmadi" deb o'tkazildi va **birinchi firma davom etdi** (FR-8.8).
  Qolgan acceptance ssenariylari real Didox'da tekshirildi (Claude, Sir vaqtini olmasdan):
  **(1) `kill -9` saqlash o'rtasida** → jurnalda `saving` → ilova ochilishida `needs_check{INTERRUPTED_SAVE}` →
  keyingi run Didox ro'yxatidan o'sha qoralamani topdi, belgiladi va **qayta yaratmadi** (`ALREADY_DRAFTED`);
  **(2) saqlash ichida bekor qilish** → kritik bo'lim tugaguncha davom etdi, ID topildi va faktura belgilandi
  (yarim belgi qolmadi); **(3) locator ataylab buzildi** → firma `PAGE_UNEXPECTED` bilan to'xtadi, **screenshot**
  saqlandi, fakturasi sababi bilan o'tkazildi, Didox'da hech narsa yaratilmadi. Yo'l-yo'lakay tuzatilgan ikki
  nosozlik: fokussiz oynada `keydown` yetmagani uchun МХИК to'lmay qolardi (endi oyna input fokusini oladi va
  avtoto'ldirgichga avval bosiladi), va "Диққат!" oynasi birinchi bosishda yopilmasa butun firma to'xtardi (endi
  uch marta uriniladi). Testlar: desktop 450, web 195, api 130
- 2026-10-13 — **Didox oynasi ko'rinmaydi (Sir qarori, SRS FR-8.4 yangilandi).** "Jarayonni buxgalterga ko'rsatish shart
  emas" → oyna `setOpacity(0)` + `setIgnoreMouseEvents(true)` bilan ochiladi (bosishlar ostidagi oynaga o'tadi);
  `DIDOX_SHOW_WINDOW=1` uni qaytaradi. **O'lchov (2026-10-13):** oynani butunlay yashirish yoki kichraytirish
  **ishlamaydi** — bunday oyna sintetik bosish/klaviaturani qabul qilmaydi (ogohlantirish yopilmadi, maydonlar
  to'lmadi); render bo'layotgan (hatto yopilgan yoki shaffof) oyna ishlaydi. Shaffof oynada to'liq zanjir uch marta
  tekshirildi (yaratildi → o'chirildi). **E-IMZO parol oynasi baribir ekranda chiqadi** — u E-IMZO'niki; to'liq fon
  rejimi uchun Didox'ga parol bilan kirish kerak (Sir buxgalterdan aniqlaydi — A varianti)
- 2026-10-13 — **M8c c1 GATE O'TDI (Sir bilan, real Didox).** Ilova Fakturalar sahifasidagi tugmadan bitta fakturani
  (sentabr 2026, 1 315 068.49) o'zi yaratdi: Didox'ga ERI bilan kirdi, formani to'ldirdi, "Сақлаб қолиш" bosdi,
  qoralama ID'sini ro'yxatdan topdi va ilovada `source: didox` bilan belgiladi; qayta bosilganda hech narsa
  yaratilmadi. Sir qoralamani Didox'da maydonma-maydon tekshirdi (§9.1 ga mos). Qurilgan: forma/ro'yxat locator'lari
  (sanitizatsiya qilingan DOM fixture'lari + jsdom testlari), `steps/create-draft.ts` (0–13), `create-drafts.ts`
  (orkestratsiya, firma-stop, FR-8.8), runner `createDrafts`/`status` (bloklamaydi, `runId` darhol qaytadi), IPC +
  preload, web tugma + `DidoxRunDialog` (tasdiq → jonli log → xulosa). Testlar: desktop 434, web 185, api 130 + 125 e2e.
  **Gate yo'lida topilgan va tuzatilgan beshta nosozlik** (tafsilot: `docs/research/didox-flow.md §2c`):
  (1) **yopilgan oyna to'xtatiladi** — ilovaning dialogi Didox oynasini yopganda `visibilityState: hidden` bo'lib,
  klaviatura hodisalari sahifaga yetmay qolgan (`backgroundThrottling: false` + `disable-backgrounding-occluded-windows`
  va `disable-renderer-backgrounding` + `moveTop()`); (2) "Диққат!" modali ~2.2 s da chiqadi, o'zi yopilmaydi va eski
  locator unga mos emas edi (`.blackout.main-alert > .alert-app`) — endi ochilishda ham, to'ldirish davomida kech
  chiqsa ham yopiladi; (3) kontragent nomi boshqa ustunda ("Ҳамкорингизнинг Корхонаси"); (4) МХИК tanlangach
  birlik/ҚҚС/имтиёз ketma-ket to'ladi — har biri alohida kutiladi; (5) "Акциз" yorlig'i ikki marta uchraydi.
  Qo'shimcha: har maydon yozilgach o'qib tekshiriladi va kerak bo'lsa qayta yoziladi, oxirgi urinishda klaviaturasiz
  qo'yiladi (jonli logda aytiladi). Sinov ma'lumoti (BIG WORLD RETAIL, shartnoma 12/25) Sir bazasida qoldi — kerak
  bo'lmasa o'chiriladi
- 2026-10-13 — **M8 doirasi bo'yicha Sir qarori: c1 tugatiladi, so'ng qayta baholanadi.** Sabab (ochiq muhokama):
  ilovaning asosiy maqsadi (aniq foiz, qoldiq, hisobot) allaqachon bajarilgan; M8 — qulaylik qatlami, imzolashni
  baribir buxgalter qiladi, va bu — birovning UI'siga bog'liq yagona qism (spike kuni Didox uchta narsani o'zgartirgan).
  Shuning uchun c1 (bitta faktura, qo'lda ishga tushirish) real gate'da sinaladi → tezlik va ishonchlilik ko'rinadi →
  **c2 va M8d haqida qaror shundan keyin**
- 2026-10-13 — **Sir qarorlari (spike'dan keyin, c1 oldidan):** (1) `ққс, Миқдор` bo'sh bo'lsa **faqat `ққс, %` = ҚҚСсиз
  bo'lganda** `0n` deb qabul qilinadi (spec §1 yangilandi); (2) desktop'ga **`jsdom`** dev-dependency qo'shiladi — c1 da
  locator'lar sanitizatsiya qilingan drift-fixture ustida testdan o'tadi; (3) UI tili bo'yicha **kirill matniga tayanib
  davom** etiladi (topilmasa aniq xato + firma-stop), tilni majburlash c2/M8d ga qoldirildi
- 2026-10-13 — **Spike S1–S7 o'tkazildi (Sir bilan, real Didox + E-IMZO) — natijalar `docs/research/didox-flow.md §2c`.**
  **S1 YASHIL:** M8b login gate Electron 44 da to'liq o'tdi (ilova kalitni tanladi, parolni E-IMZO oynasiga o'zi yozdi,
  kirdi, firmani tasdiqladi). Yo'lda **Didox login va hujjatlar sahifasi qayta dizayn qilingani** aniqlandi va **besh
  tuzatish** kiritildi: (1) `eimzo/client.ts` — E-IMZO kalitlar ro'yxatini `Origin` sarlavhasisiz bermaydi (`-1022`,
  "Domen null uchun API-kalit yaroqsiz") → `Origin: http://localhost` (apikey kerak emas; §1a dagi eski yozuv noto'g'ri
  edi); (2) `keyPicker` → `.certs-trigger`; (3) `selectedKeyInn` → `.certs-trigger__inn` (ochiq menyu eski
  `.certs-select__*` klasslarini saqlagan); (4) `byExactTextJs` faqat **bir xil selektorga mos** avlodni hisobga oladi —
  Didox tugma matnini `<span>` ga o'rab qo'ygan, "Кириш" topilmay qolgandi; (5) `view.ts`: `type()` har belgi uchun
  `keyDown+char+keyUp` yuboradi (faqat `char` bilan niqobli sana va МХИК avtoto'ldirgichi **jim e'tiborsiz qoldiradi**),
  `clear()` sintetik Cmd+A o'rniga `webContents.selectAll()` ishlatadi (eskisi maydonni tozalamasdi — summa qo'shilib
  ketish xavfi). Har bir tuzatish haqiqiy sahifada ishlab chiqarish kodi bilan tekshirildi.
  **Spike javoblari (c1 uchun):** `ORIGIN_SERVICE_LABEL = "Хизмат кўрсатиш"`; `DIDOX_DECIMAL_SEP = '.'` (Нарҳ `552328.77`
  yoziladi va shunday qaytadi); МХИК to'liq kodga **bitta** variant, tanlangach ўлчов/ҚҚСсиз/Имтиёз 102898 o'zi qo'yiladi;
  jadval ustunlari **sarlavha matni bo'yicha** topilishi shart (Имтиез ustuni qo'shilib indekslar siljiydi); saqlash
  endpoint'i `POST api.didox.uz/v1/documents/002/create/uz` → `classifyRequest` **allow**, bloklangan tashqi hostlar
  sahifani buzmaydi; saqlagach ro'yxat **o'zi yangilanadi**, `?partner=`/`limit=100` ishlaydi; UUIDv1 vaqti soat bilan
  ~1 s farq qildi va haqiqiy qatorlarda `parseListRow`/`matchOwnDraft` **aynan bitta** moslik berdi; `setEnabled(false)`
  oynada bosish/yozish ishlaydi; tashlangan forma server'da saqlanmaydi. Sinov qoralamasi yaratildi → **o'chirildi**
  (Имзолаш bosilmadi). **c1 ni bloklaydigan ochiq band:** ҚҚСсиз holatda `ққс, Миқдор` maydoni **bo'sh** qoladi (`0` emas) —
  spec §1 forma tekshiruvi buni nol deb qabul qilishi kerak. Boshqa ochiqlar: UI tili hisob profilidan keladi (kirill
  locator'lar shunga bog'liq); jsdom fixture uchun paket qo'shish — Sir qarori. Testlar: desktop 344, api 130 + 125 e2e, web 178
- 2026-10-13 — **M8c c0 qabul qilindi — Sir.** Keyingi qadam: spike S1–S7 (Sir bilan, real Didox, kodsiz) → c1
- 2026-10-13 — **M8c c0 poydevori qurildi (Opus, TDD).** Sir spec v5 ni tasdiqladi → c0 Didox'ga tegmasdan qurildi:
  SRS deltalari (FR-8.4 bloklamaydi + `expectedAmount`; FR-8.5 karantin → "e'tibor kerak" + o'tkazib yuborish belgisi +
  faqat-o'qib tiklash; FR-8.6 firma-stop va faktura-darajali farqi; FR-8.7 `userData/didox-runs`, 50 ta, tiklash; §9.1 kelib
  chiqishi yorlig'i spike'dan) · `api/jwt.ts` (HS256, ilova o'z API'siga qisqa token bilan kiradi) + API e2e (tashqi token
  qabul qilinadi; `alg:none`/boshqa sir/muddati o'tgan → 401) · `api/client.ts` (`listInvoices`, `markDraft`;
  `confirmWarnings` **hech qachon** yuborilmaydi) · `didox/money.ts` (BigInt tiyin; `src/didox`+`src/api` da
  `Number(`/`parseFloat(`/`parseInt(` taqiqi qo'riqchi test bilan) · `didox/parse.ts` (UUIDv1 vaqti, Toshkent oy boshi,
  ro'yxat qatori, `matchOwnDraft` — fail-closed) · `didox/journal.ts` (write-ahead yozuv, holat mashinasi taqiqlar bilan,
  `recoverStaleRuns`, `flushIdFound`, 50 ta rotatsiya + e'tibor kerak yozuvlar saqlanadi) · `didox/skips.ts` ·
  `contract.ts` 19 yangi kod + o'zbekcha xabarlar (`DIDOX_MESSAGES`, `MAY_HAVE_SAVED`) + `ProgressEvent` kengayishi ·
  `Page.clear/reload/selectOption` (view.ts da real, `FakePage` da poll qiladigan `waitFor`) · `run.ts` refaktor:
  `loginFirm` ajratildi, 180 s watchdog **o'rniga** heartbeat (`engine.ts`: bitta qulf, `stallMs`/`graceMs`, kritik bo'lim
  `CRITICAL_MAX_MS` bilan, majburiy `win.close()` — zombi qulf yo'q). Testlar: desktop 331, api 130 unit + 125 e2e (pg va
  PGlite), web 178 — hammasi yashil, typecheck toza. Ikki ataylab chekinish (Sir'ga): `uuidV1TimeMs` `number` emas
  `bigint` qaytaradi (float qo'riqchisi butun qatlamda ishlasin), engine `run.ts` dan alohida faylga ajratildi (Didox'siz
  sinalishi uchun). `status()`/`createDrafts`/`rotate()` chaqiruvi — c1 da.
  **code-review (high) 12 topilma — hammasi yopildi:** (1) oyna ochilishidan oldingi qadamlar (E-IMZO ro'yxati, Keychain,
  preflight, sessiya tozalash) `PREPARE_TIMEOUT_MS` bilan chegaralandi — aks holda javob bermagan dep qulfni butun jarayon
  umriga band qilardi; (2) `clear()` fokusni har urinishda qayta oladi (React re-render fokusni oladi); (3) `valueScript`
  `null` = element yo'q, '' = tozalandi — farqlanadi; (4,5) `res.json()` o'ralgan — buzuq 200 javob `SyntaxError` otmaydi
  (`BAD_BODY`); (6) journal yozuvi `fsync` qiladi (fayl + katalog) — elektr o'chsa ham `saving` o'qiladi; (7)
  `PAGE_UNEXPECTED` endi "hech narsa saqlanmadi" deb da'vo qilmaydi (12-qadamdan ham keladi); (8) `RUN_IN_PROGRESS`,
  `UNEXPECTED`, `EIMZO_ERROR`, `KEY_UNKNOWN` kodlari `DidoxCode` ga qo'shildi; (9) majburiy `win.close()` kritik bo'lim
  ichida ishlamaydi; (10) shartnoma raqami solishtirishdan oldin normallashtiriladi (`№ 12/25 от` → `12/25`) — aks holda
  har faktura `SAVED_ID_UNKNOWN` bo'lardi; (11) `rotate()` buzuq fayllarni ham o'chiradi; (12) skip kaliti oyni
  validatsiya qiladi. Testlar: desktop 343, api 130 + 125 e2e, web 178
- 2026-10-13 — **M8c spec v5 (Fable) — docs/plans/M8c-spec.md.** plan-reviewer (Sonnet) M8c-REVIEW.md: APPROVE_WITH_CHANGES, 4 blocker (reja v1–v4 o'ziga va qurilgan kodga zid: PUT `expectedAmount`siz → 400; `didox_runs` ikki joyda; tiklash oynasi `now`gacha; 180 s watchdog real run'ni o'ldiradi) + 7 major — hammasi v5 da yopildi. **Sir qarorlari:** faktura-darajali "o'tkazib yuborish" belgisi (deterministik xato firmani har oy to'xtatmasin); run paytida ilova **bloklanmaydi** (`expectedAmount` guard + banner, hard-lock arzimaydi). Reja faylida M8c bo'limlari "→ v5" belgilandi, v3 bekor. Keyingi: Sir gate → c0
- 2026-10-12 — **M8c yadrosi Claude tomonidan quriladi — Sir.** Oldingi "Didox formasini avtomatlashtirish — Claude qurmaydi" yozuvi bekor (v2 to'liq qaytarilgan): FR-8.4 qoralama forma roboti login autotype kabi quriladi. Tekshiruv sessiyasida M8a+M8b spec/CONSTITUTION §12–16 ga mos deb tasdiqlandi (desktop 204 test, typecheck toza); PROGRESS jadval satri haqiqiy holatga keltirildi. M8c complex → avval reja (docs/plans/M8-didox-drafts.md M8c) + plan-reviewer gate
- 2026-10-12 — **M8 v2 doirasi qaytarildi — Sir:** "ilova o'zi yozadi". v3 dagi "Claude qurmaydi" bekor; FR-8.2 parol ombori (safeStorage, kalit seriyasiga bog'langan) + Firmalar'da "ERI parol" ustuni qurildi (desktop 29, web 170 test). M8b PM uslubida parallel agentlarga bo'lindi (autotype · driver/login · view/run/IPC/web)
- 2026-10-12 — **B1 (Didox Excel importi) bekor — Sir:** "bu xususiyat kerak emas". Saboq: Didox avtomatlashtirish imkonsiz bo'lgach muqobil izlashni davom ettirmasdan, avval ilova maqsadiga zarurligini so'rash kerak edi. Tadqiqot hujjati (docs/research/didox-excel-import.md) ma'lumot uchun qoladi
- 2026-10-12 — **A3: yangilanish qo'lda** — Sir. Yangi versiya = yangi o'rnatgich (dmg / keyin Windows NSIS), buxgalter ustidan o'rnatadi; ma'lumot `userData` da qoladi (migratsiya + snapshot ilova ichida). Avtomatik yangilanish (electron-updater) yo'q
- 2026-10-12 — **A5 macOS qadoqlash:** API runtime bog'liqliklari Node resolution bo'yicha hisoblanib (`scripts/runtime-packages.mjs`, Prisma CLI tarmog'isiz) qolgani kesiladi + Prisma'ning postgresql'dan boshqa query compiler'lari va .map'lar olib tashlanadi: staged API 299M→170M, .app 627M→489M, `dmg` 160M (`pack:mac:dmg`, hdiutil verify VALID). Kesilgan ilova smoke: setup, login, validatsiya, shartnoma/operatsiya/hisobot, Excel, fakturalar, kunlik zaxira. Ikonka: `build/icon.svg`→`icon.png` (sarlavhadagi Landmark, #1E40AF)
- 2026-10-12 — `pnpm audit --prod`: 4 ta (mysql2 ×2, deepmerge-ts, uuid — hammasi tranzitiv) → pnpm `overrides` bilan yamalgan versiyalar; audit toza; unit/e2e (pg+PGlite, Excel), prisma validate, qadoqlash staging tekshirildi
- 2026-10-12 — Stavka o'zgarishini o'chirish ham tekshiriladi (RETROACTIVE + DRAFTED_INVOICE_CHANGES, `?confirmWarnings=true`); web'da umumiy `DeleteWithWarningsDialog` (operatsiyalar va stavkalar). Brauzerda № 12/25 da tekshirildi (o'chirilmadi). Web dev porti `PORT` dan (launch.json autoPort)
- 2026-10-12 — **O'chirish ogohlantirishi + DRAFTED_INVOICE_CHANGES** (Sir: ikkalasi): `DELETE …/operations/:id` manfiy qoldiq / ortiqcha foiz to'lovi bo'lsa 409 → oynada ogohlantirish → `?confirmWarnings=true`; qo'shish/tahrirlash/o'chirish qoralama qilingan oy foizini o'zgartirsa ogohlantirish. Brauzerda tekshirildi (dev ma'lumot o'chirilmadi). SRS FR-3.2, FR-3.7
- 2026-10-12 — **Kunlik zaxira** (Sir: faqat lokal, 14 kun + har oydan bittasi 1 yil, tiklash qo'lda): API `BackupService` (ishga tushganda + har soat, `daily-YYYY-MM-DD.tgz`, `.partial`→rename, migratsiya snapshot'lariga tegmaydi); sarlavhada "Zaxira" (desktop); `apps/api/scripts/restore-backup.mjs` + docs/runbooks/restore-backup.md (tiklash end-to-end tekshirildi). Topilma: paketda `productName` yo'q edi → userData `…/desktop` (dev bilan bir xil) — `productName: Moliyaviy yordam` qo'shildi
- 2026-10-12 — Texnik qarz yopildi: sahifalar lazy chunk (kirish bundle 714→552 kB; qolgani freymvork); 4xx xatolar qayta urinilmaydi; Excel yuklash fetch orqali — sessiya tugasa fayl emas, login (brauzerda tekshirildi). Umumiy `lib/download.ts` (M6 va M12)
- 2026-10-12 — **Electron 34 → 44.7.0** (34 EOL edi; Didox sahifasi eski Chromium'da ochilardi). Ichida Node 24.21, Chromium 152. Dev va qadoqlangan (.app 627M, arm64) ilovada setup → app → bridge → E-IMZO kalitlari, bitta API jarayoni tekshirildi; electron-builder 25 bilan qadoqlanadi
- 2026-10-12 — Qadoqlash skripti `pnpm deploy --prod` dan keyin (`finally`) `pnpm install --frozen-lockfile` bilan dev holatini tiklaydi — repo'dagi `pnpm run`/commit hook endi buzilmaydi (tekshirildi)
- 2026-10-12 — **M8c API qismi:** `PUT …/draft` — `source` (manual|didox, migratsiya 20261012100000), app belgisi uchun 32-hex Didox ID + `expectedAmount` majburiy (farq → 409 AMOUNT_CHANGED), ID'siz qo'lda belgiga ilova ID biriktirishi → POSSIBLE_DUPLICATE tasdig'i, qayta belgilash eski ID'ni saqlaydi, shartli yozish (409 DRAFT_CHANGED). Fakturalar'da "Qoralama yaratildi (Didox)". code-review (high) 7 topilma: 6 tuzatildi, dev PG bazaga migrate deploy — Sir ruxsati kutilmoqda. Didox formasini avtomatlashtirish (M8c yadrosi) — Claude qurmaydi (xavfsizlik cheklovi)
- 2026-10-12 — **M8a qabul qilindi — Sir** (doira: E-IMZO kalitlar + ERI ustuni + desktop mustahkamlash; FR-8.2 parol ombori va E-IMZO'ga avto-yozish **Claude qurmaydi** — xavfsizlik cheklovi; kirishda parolni buxgalter E-IMZO oynasiga o'zi kiritadi). Keyingi: M8c — buxgalter kirgan sessiyada qoralamalar; avval B4 spike
- 2026-10-12 — **M8a qisman:** SRS M8 yo'l B ga qayta yozildi; desktop TypeScript'ga o'tdi; E-IMZO qatlami (parseAlias, matchKeys, faqat-o'qish klienti) + IPC qo'riqchisi (origin solishtirish, M3) + `activate` ikkinchi API'ni ochmaydi (M4) + Firmalar sahifasida "ERI kalit" ustuni (faqat desktop). Haqiqiy E-IMZO bilan app ichida tekshirildi. Testlar: desktop 15, web 156, api 124. parol ombori — qurilmaydi (keyingi qatorga qarang)
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
- **Didox sahifasi o'zgarishi** (yo'l B): Didox UI/selector'lari ogohlantirishsiz o'zgarsa avtomatlashtirish to'xtaydi — fail-closed, didox-flow.md xaritasi yangilanadi
- E-IMZO parolini ilova o'zi yozadi (macOS + Windows, Windows'da 2026-10-15 tasdiqlandi), lekin faqat buxgalter klaviaturadan uzoq bo'lsa (3 daq) — aks holda oy "kutmoqda" (tray + bildirishnoma); natija vaqti kafolatlanmaydi (M8d)
- Desktop PGlite: `timestamptz` ustunlari (created_at, updated_at, drafted_at) kompyuter vaqt zonasi bo'yicha **5 soat erta** saqlanadi (`pglite-prisma-adapter` offset'siz yozadi, o'qishda qoplaydi — ilova to'g'ri ko'rsatadi; UUIDv7 bilan tasdiqlandi 2026-10-15). Sana (`DATE`) ustunlari — pul sanalari — ta'sirlanmaydi. M13 ko'chishida `migrate-data.ts` to'g'rilaydi (eksport o'sha kompyuterda)
- Desktop testlarining 4 tasi Windows'da yiqiladi (POSIX fayl ruxsatlari, `\` yo'l ajratuvchisi) — testlar Windows'ga moslanmagan
- Har buxgalterda alohida baza → kunlik lokal zaxira bor (2026-10-12), lekin bir diskda; ilovani yangilash har kompyuterda (M9)
- M7/M8: summa formati (`552328.77`, mingliklar) haqiqiy Didox formasidagi kiritishda tekshirilmagan
- M4: ro'yxat har so'rovda har shartnoma uchun to'liq yadroni ishlatadi — yuzlab shartnomada yetarli; ko'paysa yengil "faqat jamilar" rejimi yoki kesh
- M1 FR-1.3: o'zbek (kirill) tilidagi Didox eksport yorliqlari haqiqiy fayl bilan tekshirilmagan — o'zbekcha eksport namunasi kerak
- M1: logout JWT'ni bekor qilmaydi (12 soat amal qiladi) — bitta umumiy login uchun qabul qilingan; kerak bo'lsa token versiyasi bilan yopiladi
- M1: Create/Update company DTO qoidalari takrorlangan — keyingi DTO'lar ko'payganda umumiy helper
- Didox login: 25 noto'g'ri urinish → doimiy blok — avtomatik qayta urinish taqiqlangan
- Bitta umumiy login — barcha firmalar ma'lumoti hammaga ochiq (Sir ongli qabul qilgan)
