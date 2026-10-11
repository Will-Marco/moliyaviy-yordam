# PLAN — Modul 9 (o'zak): Electron qobig'i + lokal PGlite

> Maqsad: hozirgi NestJS API + React web **bitta Electron ilovasi** sifatida buxgalter
> kompyuterida (Windows; dev — macOS) lokal ishlasin; ma'lumot **lokal PGlite** bazasida;
> alohida server/PostgreSQL yo'q. Bu M8 (yo'l B — Didox brauzerni boshqarish) uchun poydevor.

Status: **reja** (plan-reviewer tekshiruvidan keyin Sir gate).
Manba: docs/research/windows-packaging.md (Electron 44 + PGlite 0.5.8 + pglite-prisma-adapter, sinalgan),
docs/research/e-imzo.md. CONSTITUTION §7 (pul float emas), §16 (lokal).

## Doira (shu modulda)
1. **`apps/desktop`** — yangi Electron paketi (main process):
   - Ishga tushganda NestJS ilovasini **shu process ichida** (`NestFactory`, `listen(127.0.0.1, <port>)`) ko'taradi;
     web statik build Nest orqali beriladi (hozircha ham same-origin).
   - Asosiy `BrowserWindow` → `http://127.0.0.1:<port>`.
   - Tray ikonka, `requestSingleInstanceLock`, `setLoginItemSettings` (login'da avtostart).
   - `app.getPath('userData')` — ma'lumot va sozlama shu yerda.
2. **Baza: `@prisma/adapter-pg` → `pglite-prisma-adapter` (PGlite)**:
   - PGlite fayl-bazasi `userData/db` da.
   - Ishga tushganda migratsiyalar qo'llanadi (hozirgi 8 migratsiya, CHECK'lari bilan — tadqiqotda sinaldi).
   - `Decimal(18,2)` aniqligi saqlanadi (SQLite rad etilgan — `…,99`→`…,98`).
3. **Sozlama/sirlar (lokal)**: `AUTH_PASSWORD_HASH`, JWT siri, (kelgusi) shifrlash kaliti —
   birinchi ishga tushganda `userData` da yaratiladi/saqlanadi. Bitta umumiy login saqlanadi (SRS FR-1.1).
4. **Qadoqlash**: `electron-builder` — Windows **NSIS per-user** (adminsiz), macOS `dmg` (dev).
   `@node-rs/argon2` native modul `win32-x64-msvc` prebuilt bilan to'g'ri bundle qilinadi.
5. **Testlar yashil qoladi**: Nest va web testlari o'zgarmaydi; e2e **PGlite'ga qarshi** ham o'tkaziladi
   (adapter almashinuvi hech narsani buzmasligi uchun).

## Doiradan tashqari (keyingi modullar)
- Didox brauzerni boshqarish, E-IMZO, oylik scheduler/catch-up, `powerMonitor` — **M8**.
- `electron-updater` avtomatik yangilash, code signing/SmartScreen — **M9-qadoqlash** (alohida bosqich).
- Zaxira nusxa (kunlik `pgDump`) — M9-qadoqlash.

## Qadamlar (TDD, kichik qadamlar)
1. `apps/desktop` skeleti: Electron main, Nest'ni in-process ko'tarish, bo'sh oyna `127.0.0.1` ga ulanadi.
2. Prisma adapterini PGlite'ga almashtirish; migratsiyalarni dastur ichida qo'llash funksiyasi + testi.
3. e2e konfiguratsiyasini PGlite bilan ishlatish (yoki ikki rejim: CI=pg, prod=PGlite — reviewer bahosi).
4. `userData` da sozlama/sir yaratish (birinchi ishga tushish) + testi.
5. Tray, single-instance, avtostart.
6. `electron-builder` konfiguratsiyasi; macOS `dmg` yig'iladi va ochiladi (dev-tekshiruv).

## Ochiq savollar (plan-reviewer + Sir)
- A) e2e: CI da `pg`, prodda PGlite — ikki yo'lni saqlash xavfi (divergensiya) vs hammasini PGlite'ga o'tkazish.
- B) PGlite "alpha": elektr o'chishida chidamlilik hujjatsiz. Pul bazasi uchun qabul qilamizmi, yoki
  zaxira yo'l `embedded-postgres` (haqiqiy PostgreSQL binar, lekin og'irroq)?
- C) Prisma 7 WASM so'rov-kompilyatori Electron main'da (asar/asarsiz) ishlaydimi — Windows'da tekshiriladi.
- D) Nest'ni in-process ko'tarishmi yoki child-process (toza o'chirish, qayta ishga tushirish oson)?
- E) Port: qat'iy (masalan 31725) yoki bo'sh portni topish; band bo'lsa nima qilamiz.
- F) Imzosiz NSIS → SmartScreen ogohlantirishi (M9-qadoqlashga qoldiriladi, lekin Sir bilishi kerak).

## Acceptance (bu o'zak uchun)
- `pnpm` bilan Electron dev ishga tushadi, macOS'da oyna ochilib ilova (login→shartnomalar) ishlaydi.
- Ma'lumot PGlite'da saqlanadi, dasturni qayta ochganda turadi; `Decimal(18,2)` aniq.
- Barcha mavjud testlar (api unit+e2e, web) yashil; e2e PGlite'da ham yashil.
- Haqiqiy server/PostgreSQL talab qilinmaydi.

---
## v2 — plan-reviewer o'zgarishlari (2026-10-12, Sir qarorlari bilan)
Reviewer: APPROVE_WITH_CHANGES ([M9-REVIEW.md](M9-REVIEW.md)). Qurish quyidagilar yopilmaguncha boshlanmaydi.

**Modul ikkiga bo'lindi:**
- **M9a — lokal baza:** Prisma pg → PGlite; migratsiyalarni dastur ichida qo'llash; zaxira (migratsiyadan
  oldin snapshot + kunlik `pgDump`); `apps/api` o'zgarishlari (quyida). e2e PGlite'da yashil.
- **M9b — Electron qobig'i:** Nest'ni **child-process**da ko'tarish, bo'sh (efemer) portda `127.0.0.1`;
  statik SPA berish; Electron xavfsizligi (contextIsolation, sandbox, navigatsiya bloki, host allow-list,
  Didox uchun alohida session partition — M8 oldidan); `electron-builder` NSIS/dmg.
- Tray, avtostart, scheduler/catch-up → **M8**.

**Birinchi (spike, qurishdan oldin):**
1. **e2e PGlite'da** — asosiy xavf: `pglite-prisma-adapter` tranzaksiya, `TRUNCATE … CASCADE` (test reset),
   CHECK, `Decimal(18,2)` aniqlik va **`P2002`** xato kodini (companies.service.ts:33, contracts.service.ts:140,
   company-import.service.ts:109) to'g'ri qaytaradimi. O'tmasa → embedded-postgres.
2. **Ishonchlilik:** PGlite'ni `startParams` dan `-F` siz (fsync ON) ishga tushirib, fsync bo'layotganini
   o'lchash. Haqiqiy elektr o'chish (hard-reset) testi — **Windows gate** (keyinga; Sir macOS'da quradi).
   Oraliqda himoya: snapshot + kunlik pgDump o'zakda.

**`apps/api` o'zgaradi (reviewer: "Nest o'zgarmaydi" — noto'g'ri edi):**
- `main.ts` top-level await → import qilinadigan `bootstrap()` ga.
- `env.ts`: `DATABASE_URL`/hash/JWT majburiyligi lokal rejimda yumshatiladi; `COOKIE_SECURE` default `false`
  (127.0.0.1 http). `PrismaService` pg'ga qattiq bog'langan — adapter almashtiriladi.
- Statik web (Express 5 SPA fallback) Nest'dan beriladi; `pretest:e2e`, `test/helpers.ts` moslanadi.
- Migratsiya runner: har migratsiya + ledger yozuvi bitta tranzaksiyada; app'dan yangi bazadan himoya;
  `migrate diff` pg'ga nisbatan saqlanadi (drift bo'lmasligi uchun). SQL fayllar paketда qayerda — aniqlanadi.
- Birinchi ishga tushishda parol oqimi aniqlanadi (kim o'rnatadi, setup endpoint himoyasi).

**Qarorlar:** D — child-process; E — efemer port. CI yo'q (`.github/` yo'q) — e2e ikki bazada keyin CI bilan.
**Acceptance aniqlashtiriladi:** aniq Decimal qiymatlar, ikkinchi nusxa (single-instance) testi, notoza
chiqishdan keyin ma'lumot turishi, noma'lum migratsiya xatosi, ko'rinadigan xato yo'li.
