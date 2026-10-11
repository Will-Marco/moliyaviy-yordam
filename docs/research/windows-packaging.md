# Windows'ga qadoqlash (M9) — tadqiqot

Sana: 2026-10-11. Til: o'zbekcha (lotin), texnik atamalar inglizcha.
Savol: ilova har buxgalterning Windows 10/11 kompyuteriga alohida o'rnatiladi (umumiy baza yo'q), E-IMZO bilan lokal ishlaydi, oyning 1-kuni ish bajaradi. Qaysi qobiq (shell), baza, yangilash va jadval (scheduler)?

Belgilar: **[TASDIQLANDI]** — rasmiy manbada yozilgan. **[TAJRIBA]** — shu loyiha kodi/sxemasi bilan macOS'da (Node 24.18, Prisma 7.10.0) o'zim sinab ko'rdim, skriptlar scratchpad'da. **[XULOSA]** — manbadan kelib chiqqan xulosam. **[TEKSHIRILMADI]** — tasdiqlab bo'lmadi, haqiqiy Windows kompyuterda sinash kerak.

Kod o'zgartirilmadi. Faqat shu fayl yozildi.

---

## 0. Xulosa (TL;DR)

| Qaror | Tavsiya | Zaxira |
|---|---|---|
| Qobiq | **Electron** (NestJS main process ichida yoki `utilityProcess`'da; oyna `http://127.0.0.1:PORT` ni yuklaydi; tray; avtostart) | Node SEA/`@yao-pkg/pkg` + Edge `--app` + o'z tray'i (yengilroq, lekin hammasini o'zimiz yozamiz) |
| Baza | **PGlite** (WASM Postgres, jarayon ichida, `%APPDATA%` ichidagi papka) + `pglite-prisma-adapter` | `embedded-postgres` (haqiqiy PostgreSQL 18 bola jarayon sifatida) — sxema va migratsiyalar o'zgarmaydi |
| Yangilash | `electron-updater` + **generic provider** (yoki faqat-binary ochiq releases repo). Private GitHub repo + ilova ichida token — **yo'q** | Qo'lda yangi o'rnatgich yuborish |
| Jadval | Ilova ichida scheduler + **catch-up** (ishga tushganda va `resume`da "o'tkazib yuborilgan oylar"ni tekshirish) + Windows avtostart (`setLoginItemSettings`) | Task Scheduler `StartWhenAvailable` — keraksiz murakkablik |
| Imzolash | Avval imzosiz (SmartScreen "Run anyway"), haqiqiy PC'larda Smart App Control'ni tekshirish; Azure Artifact Signing O'zbekiston uchun **mavjud emas** | OV sertifikat (reseller) |

Eng katta noaniqliklar: (1) PGlite "Alpha" va jamoa adapteri — elektr o'chishidagi (power loss) chidamlilik hujjatlashtirilmagan; (2) E-IMZO bilan Electron/Chromium'dan `wss://127.0.0.1:64443` va API-KEY (domen bo'yicha) — Windows'da sinalmagan; (3) imzosiz o'rnatgich + antivirus/Smart App Control.

---

## 1. Qobiq (shell) variantlari

### 1.0 Loyiha uchun muhim faktlar (kodni o'qib)

- API: ESM (`"type": "module"`), NestJS 12, Express platform. `main.ts` — `NestFactory.create` + `app.listen(PORT)`. Hozircha veb fayllarni **API xizmat qilmaydi** (ServeStatic yo'q) — veb dev'da Vite proxy orqali `/api` ga boradi. [TAJRIBA: kodni o'qidim]
- `PrismaService` — `new PrismaPg({ connectionString })`. Xom SQL (`$queryRaw`), `$transaction`, advisory lock **yo'q** (grep). [TAJRIBA]
- Native modul faqat `@node-rs/argon2` (N-API). npm'da `@node-rs/argon2-win32-x64-msvc` va `win32-arm64-msvc` prebuilt'lari bor — kompilyatsiya shart emas. [TAJRIBA: npm registry] https://registry.npmjs.org/@node-rs/argon2
- Prisma 7.10: generated client'da `query_compiler_fast_bg.postgresql.wasm-base64.js` kabi fayllar bor, ya'ni Rust engine binary **yo'q**, so'rov kompilyatori WASM sifatida JS ichiga base64 qilib joylangan. Shuning uchun `asarUnpack`/native binary muammosi Prisma tomondan kutilmaydi. [TAJRIBA: `apps/api/node_modules/@prisma/client/runtime`] Rasmiy: "No Rust binary-based query engine binary is included", "Driver adapters are required" — https://www.prisma.io/docs/orm/v6/more/internals/engines (qidiruv natijasida keltirilgan), https://www.prisma.io/changelog.md ; blog: https://blog.prisma.io/blog/rust-to-typescript-update-boosting-prisma-orm-performance. [TASDIQLANDI]
  - Eslatma: `node_modules/@prisma/client/runtime` papkasi 71 MB (barcha dialektlar). O'rnatgichga faqat `postgresql` fayllari kirishi uchun `files` filtri kerak. [XULOSA]
- `exceljs`, `pg`, `class-validator`, `node-html-parser` — sof JS.

### 1.a Electron

Tuzilma: Electron main process ichida NestJS (`NestFactory.create` + `listen(0 yoki belgilangan port, '127.0.0.1')`), Nest `express.static` bilan `apps/web/dist` ni xizmat qiladi → `BrowserWindow.loadURL('http://127.0.0.1:PORT')`. Veb o'zgarmaydi (`/api` same-origin), cookie (`httpOnly`, `COOKIE_SECURE=false`) ishlaydi.

- **ESM**: Electron main process'da ESM Electron 28.0.0'dan beri qo'llab-quvvatlanadi; `"type": "module"` yoki `.mjs`. https://www.electronjs.org/docs/latest/tutorial/esm [TASDIQLANDI]. Asar va `utilityProcess` bilan ESM xulqi sahifada yoritilmagan [TEKSHIRILMADI] — Nest'ni main process'da ishga tushirish eng kam xavfli.
- **Node versiyasi**: Electron 44.0.0 = Chromium 152 + Node v24.18.1 (loyiha ham Node 24) — https://electronjs.org/blog/electron-44-0 [TASDIQLANDI]. npm'dagi oxirgi `electron` 44.7.0, Node `>=22.12` talab qiladi. [TAJRIBA: registry]
- **Child process variantlari**: `utilityProcess.fork(modulePath)` Node + message port'li bola jarayon ochadi; faqat `ready`dan keyin; stdio cheklangan. https://www.electronjs.org/docs/latest/api/utility-process [TASDIQLANDI]. API'ni alohida jarayonda ishlatish UI'ni qotishdan saqlaydi (hisob-kitob og'ir bo'lsa), lekin PGlite bitta jarayon egaligini talab qiladi (qarang 2.b) — bir jarayonda (main yoki utility, lekin faqat bittasida) bo'lishi shart.
- **Avtostart**: `app.setLoginItemSettings({ openAtLogin: true })` Windows'da ishlaydi, `path`/`args`, Task Manager'da yoqish/o'chirish holati (`enabled`) https://www.electronjs.org/docs/latest/api/app [TASDIQLANDI]. Xavfsizlik: Electron < 38.8.6/39.8.1/40.8.0 da yo'l qo'shtirnoqsiz yozilgan (CVE-2026-34768) — 44.x da tuzatilgan. https://nvd.nist.gov/vuln/detail/CVE-2026-34768 [TASDIQLANDI]
- **Tray**: `new Tray(icon.ico)` + `setContextMenu`; `window-all-closed`ga obuna bo'lib, oyna yopilganda ilovani **o'chirmaslik** mumkin (obuna bo'lmasa default — chiqish). https://www.electronjs.org/docs/latest/api/tray , https://www.electronjs.org/docs/latest/api/app [TASDIQLANDI]
- **Bitta nusxa**: `app.requestSingleInstanceLock()` — ikkinchi ishga tushirish birinchisiga xabar beradi. Ikki jarayon bir PGlite papkasiga yozmasligi uchun majburiy. https://www.electronjs.org/docs/latest/api/app [TASDIQLANDI]
- **Ma'lumot papkasi**: `app.getPath('userData')` = `%APPDATA%\<ilova nomi>`; ilova fayllarini ichki papkada saqlash tavsiya etiladi. [TASDIQLANDI, o'sha sahifa]
- **Hajm**: manbalar Electron o'rnatgichlarini 62–244 MB oralig'ida keltiradi (hello-world 62.5 MB; real ilova ~85 MB; 2026 benchmark 244 MB). https://www.pkgpulse.com/guides/electron-vs-tauri-2026 , https://dev.to/akashpattnaik/leaving-electronjs-to-the-past-3mkl [TASDIQLANDI, indikativ]. Bizda + PGlite (~25 MB `node_modules` ichida) + Prisma runtime (filtr bilan) → taxminan 100–150 MB o'rnatgich [XULOSA].
- **pnpm monorepo**: electron-builder `node_modules` ni yuradi; pnpm symlink'lari bilan muammo bo'ladi, odatiy yechim `node-linker=hoisted` (+ `public-hoist-pattern[]=*`) — https://pnpm.io/npmrc (hoisted linker), electron-forge issue: https://lightrun.com/answers/electron-forge-support-pnpm [XULOSA — o'z loyihamizda sinash kerak]. Yaxshiroq yo'l: alohida `apps/desktop` paketi, ichida esbuild/`pnpm deploy` bilan API'ni bitta papkaga yig'ish. [XULOSA]
- **macOS parity**: Electron macOS'da ham bir xil; Sir macOS'da sinaydi → bir xil kod. Windows o'rnatgichini macOS'dan qurish mumkin (electron-builder NSIS uchun Wine + makensis'ni o'zi olib keladi), lekin eski macOS'larda NSIS xatolari bo'lgan; zaxira — `USE_SYSTEM_WINE=true` yoki GitHub Actions `windows-latest`. https://www.electron.build/docs/api/app-builder-lib.interface.toolsetconfig/ , https://www.electron.build/cli [TASDIQLANDI, ammo mac→win to'liq yo'riqnoma topilmadi]. Tavsiya: CI'da Windows runner. [XULOSA]
- **Auto-update/imzolash**: 3 va 1.e bo'limlarga qarang.

Kodni moslash (Electron): `main.ts` o'rniga `desktop/main.ts`; `.env` o'rniga kod ichida konfiguratsiya: `JWT_SECRET` birinchi ishga tushishda tasodifiy yaratilib `userData`ga yoziladi (yoki OS kredensial ombori — `safeStorage`), `AUTH_*` — 5-bo'limga qarang, `COOKIE_SECURE=false`, `PORT` — bo'sh port. [XULOSA]

### 1.b Tauri + Node sidecar

- Tauri sidecar — `externalBin` orqali ixtiyoriy bajariladigan fayl, **target-triple qo'shimchali nom** talab qiladi (`name-x86_64-pc-windows-msvc.exe`). https://v2.tauri.app/develop/sidecar/ [TASDIQLANDI]. Sahifa Node'ni qanday paketlashni yozmaydi ("Node.js as a sidecar" alohida qo'llanma) [TEKSHIRILMADI].
- Tauri o'rnatgichi kichik (2–10 MB), chunki tizimdagi WebView2 ni ishlatadi — lekin bizga baribir **Node runtime'ni** (SEA/pkg orqali ~80+ MB) sidecar sifatida jo'natish kerak → hajm afzalligi yo'qoladi. https://noqta.tn/en/blog/tauri-2-desktop-apps-rust-web-technologies-2026 [TASDIQLANDI: Tauri hajmi; XULOSA: bizda afzallik yo'qolishi]
- Node SEA: ESM qo'llab-quvvatlash va native addon ishlashi hali "active development" (Stability 1.1), v27 nightly hujjatida. https://nodejs.org/download/nightly/v27.0.0-nightly20260905ad67159bea/docs/api/single-executable-applications.html [TASDIQLANDI]. `@yao-pkg/pkg` 6.x "Enhanced SEA" rejimini taklif qiladi (3-tomon da'vo). https://docsearch.algolia.com/mcp/docs/repo/yao-pkg/pkg
- Rust toolchain + WebView2 (Chromium, Windows 10/11'da odatda bor) — E-IMZO'ning o'z-o'zidan imzolangan sertifikati bilan `wss://127.0.0.1:64443` ni WebView2'da qabul qilish masalasi [TEKSHIRILMADI]. Electron'da `certificate-error` hodisasi orqali faqat shu host/port uchun ruxsat berish mumkin [XULOSA, sinash kerak].
- Xulosa: Tauri bu stek uchun **ortiqcha qatlam** (Rust + sidecar + Node), kod moslashtirish eng ko'p, hajm yutug'i yo'q. Rad etiladi. [XULOSA]

### 1.c Fon Windows service + oddiy brauzer (`http://localhost:PORT`) + tray

- Service uchun admin huquqi bilan o'rnatish kerak (har buxgalterda). `node-windows` oxirgi versiyasi `1.0.0-beta.8` (2022-08-17) — jonli emas. [TAJRIBA: npm registry] Node runtime'ni baribir paketlash kerak (SEA/pkg). Tray, avtoyangilash, o'rnatgich, "ilova ishlayaptimi" holati — hammasi qo'lda.
- Afzallik: oyna yopilsa ham jarayon yashaydi, brauzer allaqachon bor, hajm kichik. Kamchilik: foydalanuvchi har safar brauzerda `localhost` ochadi, cookie/HTTP, bir nechta Windows foydalanuvchisi bir PC'da; E-IMZO API-KEY domenga bog'langan, brauzer `localhost` ni qanday ko'rishi muhim (qarang 1.e). Admin talab qilinishi "har buxgalter o'zi o'rnatadi" maqsadiga zid. [XULOSA]
- Rad etiladi.

### 1.d Boshqa ishonchli variant — "yengil" yo'l

Node SEA/pkg → bitta `.exe` (Nest + statik veb), Inno Setup/NSIS o'rnatgich (per-user, admin yo'q), `Edge --app=http://127.0.0.1:PORT` (Windows 10/11'da Edge bor), tray — kichik helper (masalan, systray kutubxonasi) yoki umuman tray'siz. Hajm eng kichik (~80–100 MB), lekin: avto-yangilash, tray, bitta nusxa nazorati, crash-restart, imzolash — barchasi o'zimizniki; Electron'da tayyor. [XULOSA] Eksperimental SEA ESM sababli xavfli. → Zaxira variant, birinchi tanlov emas.

### 1.e E-IMZO bilan bog'liq muhim shart (qobiqni tanlashga ta'sir qiladi)

- E-IMZO'da API-KEY **bitta production domenga** beriladi; hujjatdagi namunada `localhost` va `127.0.0.1` uchun kalitlar bor va ular faqat lokal sahifalar uchun ishlaydi. https://github.com/qo0p/e-imzo-doc [TASDIQLANDI]. Origin tekshiruvi tavsiflanmagan [TEKSHIRILMADI].
- Xulosa: sahifa `http://127.0.0.1:PORT` yoki `http://localhost:PORT` dan yuklanishi kerak (maxsus `app://` protokol **emas**) — Electron varianti shuni qiladi (BrowserWindow → lokal Express). [XULOSA]
- Brauzer (Chromium) E-IMZO'ning `wss://127.0.0.1:64443` sertifikatiga ishonadimi (E-IMZO o'zining ildiz sertifikatini tizim do'koniga qo'yadimi) — [TEKSHIRILMADI]. Muqobil: WebSocket'ga Node tomonidan (main process) ulanish; unda `rejectUnauthorized` nazorat qilinadi, lekin domen-kalit mantig'i buziladi. Bu M8 spike'ining savoli, M9 shu bilan bog'liq.

---

## 2. Baza (aniq decimal, admin o'rnatishsiz)

Talab: CONSTITUTION §7 — pul `Decimal`. Sxemada `@db.Decimal(18, 2)` va `@db.Decimal(7, 4)`, `@db.Date`, `@db.Timestamptz(3)`, `@db.Uuid` (`uuid(7)`), enum, CHECK cheklovlar (migratsiyalarda).

### 2.a SQLite — **rad etildi** (tajriba bilan)

- Prisma `Decimal` → SQLite `DECIMAL` (NUMERIC affinity); hujjatda aniqlik ogohlantirishi yo'q. https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite , schema reference: https://www.prisma.io/docs/orm/reference/prisma-schema-reference [TASDIQLANDI]. SQLite'da haqiqiy decimal tur yo'q; NUMERIC ustun qiymatni REAL/INTEGER'ga aylantiradi. SQLite muallifi tavsiyasi: pulni butun son (tiyin) sifatida saqlash. https://www.sqlite.org/forum/forumpost/60050b3f5eb26eb4?t=h
- **[TAJRIBA]** `@prisma/adapter-better-sqlite3@7.10.0` bilan `Decimal` ustun: `99999999999999.99` yozildi → `99999999999999.98` qaytdi (**yo'qotish**); `1234567890123456.78` → `...456.80`; `typeof(amt)` = `real`. `552328.77` va 15 xonagacha qiymatlar to'g'ri, lekin `Decimal(18,2)` 16–18 raqamgacha ruxsat beradi. `SUM` ham floating. → CONSTITUTION §7 buziladi. Sxemani butun son (tiyin) ga o'zgartirish katta qayta yozish (yadro BigInt'da bo'lsa ham, DTO/Excel/test qatlamlari). Tavsiya etilmaydi.
- Qo'shimcha: `adapter-better-sqlite3` TypedSQL'ni qo'llamaydi (bizda yo'q). https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers

### 2.b PGlite (WASM Postgres) — **tavsiya**

Faktlar:
- PGlite — Node/Bun/Deno/brauzerda ishlaydigan Postgres; `new PGlite('./path')` — fayl tizimiga yozadi; **bitta ulanish** ("PGlite only has a single exclusive connection"). https://pglite.dev/docs/ [TASDIQLANDI]
- README'da **"Alpha"** belgisi; "PGlite is single user/connection". https://github.com/electric-sql/pglite [TASDIQLANDI]. Litsenziya: Apache-2.0 / PostgreSQL License. [TASDIQLANDI]
- Prisma adapteri: Prisma rasmiy ro'yxatida PGlite **jamoa** adapteri (repo `lucasthevenet/pglite-utils`). https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers [TASDIQLANDI]. Rasmiy `@prisma/adapter-pglite` npm'da **mavjud emas** (registry: Not found). [TAJRIBA]. npm paketi `pglite-prisma-adapter@0.7.2` (2026-01-17), peer: `@prisma/client >= 7.1.0`, `@electric-sql/pglite >= 0.2.0`. [TAJRIBA: registry]
- `@electric-sql/pglite@0.5.8` (2026-08-26): **PostgreSQL 18.3**, 32-bit WASM. [TAJRIBA: `select version()`]

**[TAJRIBA] — loyihaning haqiqiy sxemasi bilan** (`apps/api/prisma` nusxasi, Prisma 7.10.0 + `pglite-prisma-adapter@0.7.2` + PGlite 0.5.8):
1. Loyihaning **8 ta haqiqiy migratsiya SQL fayli** (CHECK cheklovlari bilan) PGlite'da tartib bilan muvaffaqiyatli bajarildi.
2. `Company`, `Contract` (`Date`, `Decimal(18,2)`), `Operation` yaratish ishladi. `Decimal` qiymatlar **aniq** qaytdi: `552328.77`, `9999999999999999.99`, `99999999999999.99`, `1234567890123456.78`, `0.10`. `aggregate _sum` ham aniq (`11334567890675785.63`).
3. 50 ta parallel `count()` — 7 ms, `$transaction` (interaktiv) ishladi, yopib qayta ochganda ma'lumot saqlanib qoldi. Bo'sh baza papkasi 39 MB.
4. **Crash testi** (`kill -9`, 6+8+8 marta, ichida 146 067 + 128 ta tasdiqlangan INSERT): yo'qotilgan tasdiqlangan yozuv **0**, baza har safar ochildi, buzilish ko'rinmadi. Ogohlantirish: dastlabki noto'g'ri test (serial ketma-ketlikdagi sakrash — qayta tiklashda sequence 32 taga oshadi) yolg'on "yo'qotish" ko'rsatgan edi; to'g'rilangan test (har yozuvga o'z kaliti) 0 ko'rsatdi. Bu faqat **jarayon o'ldirilishi** — OS ishlab turadi, fayl keshi saqlanadi. **Elektr o'chishi / BSOD (power loss)** sinalmadi va hujjatda `fsync`/durability kafolati yo'q (`relaxedDurability` faqat tavsiflangan). https://pglite.dev/docs/api , https://pglite.dev/docs/filesystems [TASDIQLANDI: hujjatda yo'q; TEKSHIRILMADI: power loss]

Migratsiyalar:
- `prisma migrate deploy` PGlite bilan to'g'ridan-to'g'ri ishlamaydi (CLI TCP/URL kutadi; adapter README'da `migrate dev/deploy` "planned" deyilgan eski holat). https://github.com/lucasthevenet/pglite-utils/tree/main/packages/prisma-adapter [TASDIQLANDI, eski README]. `prisma-pglite` (electrovir) CLI o'rami bor — https://cdn.jsdelivr.net/npm/prisma-pglite@3.0.0/README.md [TEKSHIRILMADI: biz ishlatmadik].
- Yechim (sinalgan): ilova ishga tushganda `prisma/migrations/*/migration.sql` fayllarini tartib bilan o'zimiz `pg.exec()` qilamiz, qo'llanganlarini o'z jadvalimizda (`_app_migrations(name, applied_at, checksum)`) yozamiz. Har migratsiya bitta tranzaksiyada. Yangilashdan **oldin** avtomatik zaxira. [XULOSA]
- Dev/test: e2e testlar haqiqiy PostgreSQL'da qoladi (hozirgi tartib) + qo'shimcha "PGlite smoke" e2e to'plami (xuddi shu testlar `DATABASE`=PGlite). [XULOSA]

Zaxira nusxa va ko'chirish:
- `dumpDataDir()` — gzip tarball; "boshqa Postgres versiyalari bilan mos kelmasligi mumkin, faqat PGlite'ga qaytarish uchun". https://pglite.dev/docs/api [TASDIQLANDI]
- `@electric-sql/pglite-tools` `pgDump` — WASM pg_dump, `--inserts` SQL fayl (ixtiyoriy Postgres'ga qaytarish mumkin → chiqish strategiyasi). https://pglite.dev/docs/pglite-tools [TASDIQLANDI]
- Tavsiya: (i) har yangilash/migratsiyadan oldin va kuniga bir marta `pgDump` → `%APPDATA%\...\backups\YYYY-MM-DD.sql.gz` (oxirgi 30 ta); (ii) ilovada "Zaxira nusxa olish" tugmasi (foydalanuvchi tanlagan papka/USB); (iii) yangi PC'ga ko'chirish = yangi o'rnatish + "Zaxiradan tiklash" (SQL faylni bo'sh bazaga `exec`). Papka nusxasi faqat ilova yopiq bo'lganda xavfsiz. [XULOSA]

Xavflar: Alpha; jamoa adapteri (yagona maintainer, oxirgi reliz 2026-01); 32-bit WASM 4 GiB xotira chegarasi (bizning hajm uchun ahamiyatsiz); bitta jarayon egaligi; yangilashda PGlite major versiyasi o'zgarsa data-dir mosligi — dump/restore orqali migratsiya. [TASDIQLANDI/XULOSA]

### 2.c embedded-postgres (haqiqiy PostgreSQL) — zaxira

- npm `embedded-postgres` (leinelissen): `initialise()`, `start()`, `stop()`, `databaseDir`, `port`, `persistent`; Windows/x64 qo'llab-quvvatlanadi (PG 14–18); ikkilik fayllar zonky'dan (Apache-2.0), kod MIT. https://github.com/leinelissen/embedded-postgres [TASDIQLANDI]. Oxirgi versiya `18.4.0-beta.17` (2026-06-05) — hali **beta** belgisi bilan. [TAJRIBA: registry]
- Hajm: `@embedded-postgres/windows-x64` ochilgan holda ~109 MB, macOS arm64 ~148 MB. [TAJRIBA: registry `unpackedSize`]
- Afzallik: haqiqiy Postgres → WAL, `pg_dump`, `prisma migrate deploy` **o'zgarishsiz** (hozirgi `@prisma/adapter-pg` va e2e testlar bilan 100% bir xil yo'l), power-loss chidamliligi bilan tanilgan texnologiya.
- Kamchiliklar [XULOSA]: bola jarayon hayot sikli (ilova qulasa `postgres.exe` qolib ketadi, `postmaster.pid`), TCP port (`127.0.0.1` ga bog'lash, Windows Firewall oynasi chiqmasligi uchun; port to'qnashuvi), antivirus `postgres.exe`/`initdb`ni bloklashi mumkin [TEKSHIRILMADI], zonky README: Windows'da "probably" Visual C++ 2013 Redistributable kerak bo'lishi mumkin https://github.com/zonkyio/embedded-postgres [TASDIQLANDI, ehtimoliy], PostgreSQL maxsus huquqli (root) foydalanuvchi bilan ishlamaydi (initdb) https://www.postgresql.org/docs/current/app-initdb.html — Windows uchun alohida ko'rsatma yo'q [TEKSHIRILMADI: buxgalter admin hisobida ishlasa], major yangilash `pg_upgrade`/dump talab qiladi, pnpm `approve-builds` postinstall.
- Qachon unga o'tish: agar (i) PGlite'da power-loss/korrupsiya muammosi ko'rsa, (ii) hajm/tezlik talabi oshsa. Kod o'zgarishi: faqat `PrismaService` adapteri + migratsiya bosqichi (`prisma migrate deploy` ni `child_process`/`@prisma/schema-engine` orqali ishga tushirish talab qiladi — CLI paketlash masalasi [TEKSHIRILMADI]; oddiyroq: o'sha SQL-runner ishlaydi). [XULOSA]

### 2.d Taqqoslash

| | SQLite | **PGlite** | embedded-postgres |
|---|---|---|---|
| Aniq Decimal(18,2) | **Yo'q** (tajriba) | Ha (tajriba) | Ha (real PG) |
| Mavjud sxema/migratsiya | O'zgartirish kerak | O'zgarishsiz (8/8 qo'llandi) | O'zgarishsiz |
| Admin/o'rnatishsiz | Ha | Ha, jarayon ichida | Ha, lekin bola jarayon+port |
| Hajm | kichik | ~25 MB | ~110 MB |
| Yetuklik | Barqaror | Alpha + jamoa adapteri | PG barqaror, npm wrapper beta |
| Prisma migrate | adapter bilan | o'z runner'imiz | o'zgarishsiz |
| Dev parity (macOS) | bor | bor (WASM) | bor (darwin binary) |

---

## 3. Auto-update

- `electron-updater@6.8.9` (electron-builder `26.15.3`), NSIS target. Per-user o'rnatish uchun `oneClick: true`, `perMachine: false` (admin so'ralmaydi); assisted installer + "all users" aralashuvi yangilashda xatoga olib kelgan (IPFS Desktop tajribasi) — oddiy "one-click per-user" qiling. https://www.electron.build/configuration/nsis , https://github.com/ipfs/ipfs-desktop/pull/1679 [TASDIQLANDI; to'liq non-admin oqimi uchun yagona qo'llanma topilmadi → haqiqiy non-admin Windows'da sinash kerak]
- Windows'da NSIS yangilanishi yuklab olingandan keyin **Authenticode imzosi tekshiriladi**: `win.verifyUpdateCodeSignature` default `true`, `publisherName` `app-update.yml`ga yoziladi; imzosiz ilovada maxsus `verifyUpdateCodeSignature` funksiyasi kerak. https://www.electron.build/docs/win , https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html (2020 bypass, 4.2.2da tuzatilgan), CVE-2024-39698 https://nvd.nist.gov/vuln/detail/cve-2024-39698 [TASDIQLANDI]. Imzosiz rejimda "doim null qaytaradigan" tekshiruvdan qoching; manifestdagi sha512 xesh tekshiruvi ishlashini **sinash** kerak. [TEKSHIRILMADI]
- **Private GitHub repo**: provayder `token` talab qiladi; token ilovaga joylansa, ajratib olinadi. Maslahat: generic provider (o'z HTTPS serveringiz/R2/S3) yoki faqat-binary ochiq "releases" repo. https://github.com/electron-userland/electron-builder/issues/1393 , https://github.com/kevinphelps/electron-update-server [XULOSA — rasmiy xavfsizlik ko'rsatmasi topilmadi]. Bizning binar'da maxfiy ma'lumot yo'q (haqiqiy firma rekvizitlari repo'ga yozilmaydi — Qaror jurnali 2026-10-07); lekin Didox ichki API bilan ishlash mantiqi ochiq repoda bo'lishi — Sir qarori.
- Buxgalter nimani ko'radi (loyihalash qarori [XULOSA]): ilova ishga tushganda fonda tekshiradi → yuklaydi → ilova ichida bildirishnoma "Yangi versiya X tayyor — Hozir qayta ishga tushirish / Keyin". Majburiy qayta ishga tushirish yo'q (kiritish paytida yo'qotmaslik uchun). Yangilanishdan oldin avtomatik zaxira (2.b). Pastga qaytish (downgrade) qo'llab-quvvatlanmaydi: migratsiyalar faqat oldinga.
- Imzolash/SmartScreen:
  - Imzosiz fayl: "Windows protected your PC", "Run anyway"; har yangi versiya uchun reputatsiya noldan; self-signed ham imzosiz bilan teng. Windows 11 **Smart App Control** imzosiz fayllarni, ijobiy reputatsiyasiz bo'lsa, bloklashi mumkin. https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation [TASDIQLANDI]
  - EV endi SmartScreen'ni chetlab o'tmaydi (Microsoft). Electron hujjati esa 2023-yildan EV talab deydi — manbalar qarama-qarshi; Microsoft sahifasi yangiroq (2026-08). https://www.electronjs.org/docs/latest/tutorial/code-signing
  - **Azure Artifact Signing** (ilgari Trusted Signing): Public Trust tashkilotlar uchun US, Kanada, EI, Buyuk Britaniya, Avstraliya, Yangi Zelandiya, Yaponiya, Janubiy Koreya, Singapur, Shveytsariya, Norvegiya, Isroil; yakka dasturchilar faqat US/Kanada. **O'zbekiston ro'yxatda yo'q** → bu yo'l yopiq (agar kompaniya shu hududlarda ro'yxatdan o'tmagan bo'lsa). https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart [TASDIQLANDI]
  - Qolgan yo'l: an'anaviy OV/EV sertifikat (reseller: DigiCert, Sectigo, SSL.com...) — narx va O'zbekistondan sotib olish imkoniyati [TEKSHIRILMADI].
  - Microsoft Store orqali tarqatish SmartScreen ogohlantirishini yo'qotadi, lekin ommaviy do'kon — ichki vosita uchun mos emas. [XULOSA]
  - Amaliy tavsiya: buxgalterlar soni kam bo'lgani uchun avval imzosiz + yo'riqnoma ("Run anyway"); agar Smart App Control/antivirus bloklasa — OV sertifikat. [XULOSA]

---

## 4. "Oyning 1-kuni" ishi

Yondashuvlar:
1. **Ilova ichida scheduler** (Nest `@nestjs/schedule`/oddiy `setInterval` + "keyingi ishga tushirish vaqti" hisobi). Ilova ishlayotgan paytda ishlaydi. Avtostart: `setLoginItemSettings({ openAtLogin: true })` + tray (oyna yopilsa ilova fonda qoladi). [TASDIQLANDI: API'lar]
2. **Windows Task Scheduler**: `StartWhenAvailable=true` — rejalashtirilgan vaqt o'tib ketgan bo'lsa, vazifani imkon bo'lishi bilan boshlaydi (faqat vaqtli triggerlarda). https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-startwhenavailable-settingstype-element [TASDIQLANDI]. Lekin vazifa **ilova ishlab turishini** talab qiladi (E-IMZO oynasi, PGlite bitta egasi) → vazifa faqat "ilovani ishga tushir" bo'lishi mumkin; qo'shimcha o'rnatish/ro'yxatdan o'tkazish bosqichi (schtasks). Ortiqcha.
3. **Catch-up mantig'i (har holda kerak)**: ishga tushganda va `powerMonitor` `resume` hodisasida (`suspend`/`resume` hodisalari mavjud; `shutdown` Windows'da yo'q) — "oxirgi muvaffaqiyatli bajarilgan oy" ni bazadan o'qib, undan bugungi oygacha o'tkazib yuborilgan oylarni topib navbatga qo'yish. https://www.electronjs.org/docs/latest/api/power-monitor [TASDIQLANDI]. PC 1-kuni o'chiq bo'lsa — yoqilgan zahoti, buxgalter ilovani ochganda yoki avtostartda bajariladi. [XULOSA]
4. **Muhim cheklov**: M8 jarayoni (Didox login) **E-IMZO parol oynasini** chiqaradi — ya'ni foydalanuvchi oldida bo'lishi shart; "yashirin fon ishi" yo'q. Shuning uchun "1-kuni avtomatik" aslida "1-kuni (yoki keyingi ochilishda) ilova bildirishnoma beradi: 'Oy fakturalari tayyor — Didox'ga qoralamalar yaratish'" + buxgalter bir marta tasdiqlab, E-IMZO parolini kiritadi. CONSTITUTION §13–15 bilan mos (parolni ilova ko'rmaydi, login xatosida qayta urinish yo'q). [XULOSA] Eski qaror ("07:00/08:00 qayta urinish, ilovada tasdiq yo'q") server rejasi uchun edi — qayta ko'rish kerak (Sir bilan).
5. Idempotentlik: ish `invoice_drafts (contractId × month)` unique bilan allaqachon himoyalangan; catch-up ikki marta ishlasa ham dublikat bo'lmaydi. [XULOSA: sxemadan]

Tavsiya: (1)+(3), Task Scheduler'siz.

---

## 5. Umumiy/ofis kompyuterida xavfsizlik (qisqa)

- Hozirgi: bitta umumiy login (`AUTH_USERNAME` + argon2 hash, JWT cookie). Lokal o'rnatishda bu "kim ilovani ochsa, shu kiradi" bo'lib qoladi; haqiqiy himoya — Windows foydalanuvchi hisobi va `%APPDATA%` ruxsatlari (boshqa Windows foydalanuvchisi o'qiy olmaydi). [XULOSA]
- Variantlar: (a) login'ni saqlab, parolni **birinchi ishga tushishda buxgalter o'zi belgilaydi** (hozirgi `.env` + `pnpm hash-password` jarayoni o'rnatgichda ishlamaydi); (b) login'siz — faqat Windows hisobiga tayanish, lekin ofis/umumiy PC'da xavfli; (c) kuchli: bazani shifrlash (PGlite/SQLite shifrlashsiz) — murakkab, hozir kerak emas.
- Boshqa: server 127.0.0.1 ga bog'lanishi shart (LAN'dan ko'rinmasin); tasodifiy port + Host/Origin tekshiruvi (boshqa saytlar `localhost` ga so'rov yubormasligi uchun, DNS rebinding); `JWT_SECRET` birinchi ishga tushishda tasodifiy; Didox sessiya tokeni diskka yozilmaydi yoki Electron `safeStorage` bilan. [XULOSA]

---

## 6. Yakuniy tavsiya

**Qobiq:** Electron 44 (main process'da NestJS, `127.0.0.1`, statik veb Nest'dan), NSIS per-user o'rnatgich, `setLoginItemSettings` + tray, `requestSingleInstanceLock`.
**Baza:** PGlite 0.5.x + `pglite-prisma-adapter`, ma'lumot `%APPDATA%\<Ilova>\db`; o'z migratsiya runner'i; kunlik + yangilashdan oldingi `pgDump` zaxira.
**Yangilash:** `electron-updater`, generic provider (yoki faqat-binary repo), foydalanuvchiga "qayta ishga tushirish" taklifi.
**Jadval:** ilova ichida scheduler + catch-up + `resume`; Task Scheduler yo'q.

Asosiy xavflar:
1. PGlite — Alpha + jamoa adapteri + power-loss chidamliligi noma'lum. Yumshatish: kunlik zaxira, `relaxedDurability`ni yoqmaslik, chiqish yo'li — `embedded-postgres` (sxema bir xil), SQL dump.
2. E-IMZO + Chromium sertifikat/domen-kalit — Windows'da sinalmagan.
3. Imzosiz o'rnatgich: SmartScreen/Smart App Control/antivirus; imzolash yo'li O'zbekiston uchun Azure orqali yopiq.
4. electron-updater imzosiz ilovada tekshiruvni qanday o'tkazishi.
5. pnpm monorepo + electron-builder paketlash (hoisted/`pnpm deploy`).

### Kodni moslash qadamlari (taxminiy)

1. **Spike (1–2 kun, Windows PC'da)**: bo'sh Electron + PGlite + argon2 + E-IMZO ulanish smoke (quyidagi "ochiq savollar").
2. `apps/api`: `createApp()` ni `main.ts`dan ajratish (allaqachon `configureApp`); `ServeStatic` (production'da `apps/web/dist`); `env.ts`ni `DATABASE_URL` majburiy emas qilib "desktop rejimi" (`dataDir`, `JWT_SECRET` auto, parol birinchi ishga tushishda).
3. `PrismaService`: adapter factory (`pg` | `pglite`), PGlite singleton; `onModuleDestroy`da `close()`.
4. Migratsiya runner'i (`_app_migrations`), yangilashdan oldin zaxira; yagona transaction.
5. E2E: xuddi shu to'plamni PGlite'da ham yurgizish (CI'da ikki rejim).
6. `apps/desktop`: Electron main (single-instance, tray, login item, `window-all-closed` tutish, certificate-error faqat E-IMZO host/port), `electron-builder` NSIS per-user, `electron-updater`.
7. Scheduler + catch-up (M8 bilan birga); bildirishnoma UI.
8. Zaxira/tiklash UI ("Sozlamalar"); birinchi ishga tushish ekrani (parol belgilash).
9. CI: GitHub Actions `windows-latest` da qurish; release artefaktlarini generic provider'ga yuklash.
10. Haqiqiy Windows 10 va 11 PC'larda qabul testi; buxgalter uchun qisqa o'rnatish yo'riqnomasi.

### Ochiq savollar — haqiqiy Windows PC'da sinash kerak

1. PGlite: `kill -9` emas, **elektr o'chirish / majburiy o'chirish (power loss)** simulyatsiyasi, Windows fayl tizimida (NTFS, antivirus skaneri bilan) barqarorlik; yozish tezligi.
2. Electron/Chromium'dan `wss://127.0.0.1:64443` — sertifikatga ishonadimi, `certificate-error` kerakmi; E-IMZO API-KEY `127.0.0.1` / `localhost` bilan ishlaydimi; E-IMZO "developer mode" kerakmi.
3. Imzosiz NSIS o'rnatgich: SmartScreen xulqi, Windows 11 Smart App Control bloklashi, Defender va boshqa antivirus false-positive.
4. `electron-updater` non-admin hisobda va imzosiz holatda: yangilash to'liq o'tadimi, sha512 tekshiruvi, generic provider.
5. Electron main process'da ESM Nest + `reflect-metadata` + `class-validator` dekoratorlari asar ichida (yoki `asar: false`) ishlashi; `@node-rs/argon2` win32 binary.
6. pnpm monorepo paketlash (hoisted linker yoki `pnpm deploy`), o'rnatgich hajmi va ishga tushish vaqti (sovuq start).
7. Buxgalter Windows hisobi admin emasmi / bir PC'da bir necha Windows foydalanuvchisi bormi (`%APPDATA%` har biriga alohida).
8. `setLoginItemSettings` ishga tushish tartibi E-IMZO bilan (E-IMZO tray'i tayyor bo'lguncha kutish).
9. Windows 10 da WebView2/Chromium emas — Electron o'zining Chromium'ini olib keladi (muammo bo'lmasligi kerak), lekin Windows 10 qo'llab-quvvatlash muddati va Electron 44 minimal talabi (Windows 10+) tekshirilsin. [TEKSHIRILMADI]
10. Sir bilan: server uchun tuzilgan qarorlar (07:00 qayta urinish, ilovada tasdiqsiz avtomatik) lokal rejaga mos kelmaydi — qayta ko'rish.

---

## 7. Manbalar

Rasmiy hujjatlar:
- Prisma engines / Rust-free: https://www.prisma.io/docs/orm/v6/more/internals/engines ; https://www.prisma.io/changelog.md ; https://blog.prisma.io/blog/rust-to-typescript-update-boosting-prisma-orm-performance
- Prisma driver adapters ro'yxati: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers
- Prisma SQLite: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/sqlite
- Prisma schema reference (Decimal): https://www.prisma.io/docs/orm/reference/prisma-schema-reference
- SQLite forum (decimal/butun tiyin): https://www.sqlite.org/forum/forumpost/60050b3f5eb26eb4?t=h
- PGlite: https://pglite.dev/docs/ ; https://pglite.dev/docs/api ; https://pglite.dev/docs/filesystems ; https://pglite.dev/docs/pglite-tools ; https://github.com/electric-sql/pglite
- PGlite Prisma adapteri: https://github.com/lucasthevenet/pglite-utils/tree/main/packages/prisma-adapter ; https://cdn.jsdelivr.net/npm/prisma-pglite@3.0.0/README.md
- embedded-postgres: https://github.com/leinelissen/embedded-postgres ; https://github.com/zonkyio/embedded-postgres ; https://github.com/zonkyio/embedded-postgres-binaries
- PostgreSQL initdb: https://www.postgresql.org/docs/current/app-initdb.html
- Electron: https://www.electronjs.org/docs/latest/tutorial/esm ; https://www.electronjs.org/docs/latest/api/app ; https://www.electronjs.org/docs/latest/api/tray ; https://www.electronjs.org/docs/latest/api/utility-process ; https://www.electronjs.org/docs/latest/api/power-monitor ; https://www.electronjs.org/docs/latest/api/auto-updater ; https://www.electronjs.org/docs/latest/tutorial/code-signing ; https://electronjs.org/blog/electron-44-0 ; https://nvd.nist.gov/vuln/detail/CVE-2026-34768
- electron-builder: https://www.electron.build/configuration/nsis ; https://www.electron.build/docs/win ; https://www.electron.build/cli ; https://www.electron.build/docs/api/app-builder-lib.interface.toolsetconfig/
- electron-updater xavfsizlik: https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html ; https://nvd.nist.gov/vuln/detail/cve-2024-39698
- Private repo/updater: https://github.com/electron-userland/electron-builder/issues/1393 ; https://github.com/kevinphelps/electron-update-server ; https://github.com/ipfs/ipfs-desktop/pull/1679
- Tauri sidecar: https://v2.tauri.app/develop/sidecar/
- Tauri vs Electron hajm: https://www.pkgpulse.com/guides/electron-vs-tauri-2026 ; https://noqta.tn/en/blog/tauri-2-desktop-apps-rust-web-technologies-2026 ; https://dev.to/akashpattnaik/leaving-electronjs-to-the-past-3mkl
- Node SEA / pkg: https://nodejs.org/download/nightly/v27.0.0-nightly20260905ad67159bea/docs/api/single-executable-applications.html ; https://docsearch.algolia.com/mcp/docs/repo/yao-pkg/pkg
- Microsoft SmartScreen: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- Azure Artifact Signing: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart ; https://learn.microsoft.com/en-us/azure/artifact-signing/faq
- Task Scheduler: https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-startwhenavailable-settingstype-element
- E-IMZO: https://github.com/qo0p/e-imzo-doc
- pnpm hoisted: https://pnpm.io/npmrc ; https://lightrun.com/answers/electron-forge-support-pnpm
- npm registry (versiyalar/hajmlar, 2026-10-11 holati): https://registry.npmjs.org/embedded-postgres , /@embedded-postgres/windows-x64 , /pglite-prisma-adapter , /@electric-sql/pglite , /@prisma/adapter-better-sqlite3 , /electron , /electron-updater , /electron-builder , /node-windows , /@node-rs/argon2

O'z tajribalarim (macOS, Node 24.18.0, Prisma 7.10.0) — scratchpad: SQLite Decimal sinovi, PGlite + loyiha migratsiyalari + Decimal + tranzaksiya + `kill -9` testi. Skriptlar vaqtinchalik papkada, repo'ga kiritilmagan.
