# PROGRESS — Moliyaviy yordam: foiz hisobi

> Jarvis'ning diskdagi miyasi — holat uchun yagona haqiqat manbai.
> Har Jarvis turida birinchi shu fayl o'qiladi.

**Joriy modul:** 8c — qoralama yaratish (buxgalter Didox'ga o'zi kiradi; avval B4 spike: Electron oynasida real Didox login)
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
| 8 | Didox — brauzerni boshqarib qoralamalar | Buxgalter Didox'ga ERI bilan kiradi, ilova sessiyani boshqarib qoralama yaratadi | complex | in-progress | reja v2 (docs/plans/M8-didox-drafts.md); **M8a accepted 2026-10-12** (E-IMZO kalitlar, Firmalar'da ERI ustuni; parol ombori qurilmagan); M8c navbatda | |
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
- E-IMZO paroli har kirishda buxgalter tomonidan kiritiladi (avto-yozish qurilmagan) → oy 1-kuni to'liq qorovulsiz ishga tushish yo'q, bildirishnoma orqali (M8d)
- Har buxgalterda alohida baza → kunlik lokal zaxira bor (2026-10-12), lekin bir diskda; ilovani yangilash har kompyuterda (M9)
- M7/M8: summa formati (`552328.77`, mingliklar) haqiqiy Didox formasidagi kiritishda tekshirilmagan
- Bog'liqliklar auditi: prisma ichidagi mysql2 (ishlatilmaydi), deepmerge-ts; exceljs → uuid (moderate, bizda ishlatilmaydigan yo'l). Prod deploy (M9) oldidan qayta ko'rib chiqiladi
- M4: ro'yxat har so'rovda har shartnoma uchun to'liq yadroni ishlatadi — yuzlab shartnomada yetarli; ko'paysa yengil "faqat jamilar" rejimi yoki kesh
- M1 FR-1.3: o'zbek (kirill) tilidagi Didox eksport yorliqlari haqiqiy fayl bilan tekshirilmagan — o'zbekcha eksport namunasi kerak
- M1: logout JWT'ni bekor qilmaydi (12 soat amal qiladi) — bitta umumiy login uchun qabul qilingan; kerak bo'lsa token versiyasi bilan yopiladi
- M1: Create/Update company DTO qoidalari takrorlangan — keyingi DTO'lar ko'payganda umumiy helper
- Didox login: 25 noto'g'ri urinish → doimiy blok — avtomatik qayta urinish taqiqlangan
- Bitta umumiy login — barcha firmalar ma'lumoti hammaga ochiq (Sir ongli qabul qilgan)
