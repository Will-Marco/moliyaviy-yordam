# PROGRESS — Moliyaviy yordam: foiz hisobi

> Jarvis'ning diskdagi miyasi — holat uchun yagona haqiqat manbai.
> Har Jarvis turida birinchi shu fayl o'qiladi.

**Joriy modul:** 8 + 9 — **qayta rejalash** (Didox: yo'l B — brauzerni boshqarish; lokal Windows o'rnatish). Avval M8 reja
**Oxirgi yangilanish:** 2026-10-07

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
| 9 | Windows'ga o'rnatish | Har buxgalter ilovani o'z kompyuteriga o'rnatadi | complex | pending | 2026-10-11: server o'rniga lokal; qadoqlash (baza, avtostart, yangilash) rejalanadi | |
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
