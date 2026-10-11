# Review: M9 (o'zak) — Electron qobig'i + lokal PGlite — 2026-10-12

Verdict: APPROVE_WITH_CHANGES

Reja yo'nalishi (Electron + PGlite + NSIS per-user) tadqiqotga tayanadi va o'zi mantiqli. Lekin hozirgi shaklida
(a) PGlite uchun power-loss bo'yicha **kodda ko'rinadigan** qarshi dalil e'tiborsiz qolgan, (b) barcha ma'lum xavflar
Windows'da, acceptance esa faqat macOS'da, (c) `apps/api` ga kerak bo'ladigan o'zgarishlar doiraga kiritilmagan.
Blocker'lar yopilmaguncha qurish (step 1) boshlanmasin; ular reja tuzatishi, yo'nalish o'zgarishi emas.

Tekshirilgan kod: `apps/api/{package.json,prisma.config.ts,src/main.ts,src/app.setup.ts,src/config/env.ts,src/prisma/*,src/auth/*,src/common/{dates,clock,decimal}.ts,test/*,vitest.config.e2e.ts,prisma/migrations/*}`,
`apps/web/vite.config.ts`, `pnpm-lock.yaml`, o'rnatilgan `@electric-sql/pglite@0.4.3` dist.

---

## Blocker

### B1. PGlite power-loss: savol "ochiq" emas — kodda `-F` (fsync o'chiq) bor. Reja esa PGlite'ni yagona dvigatel qilib olgan
- Fakt (men tekshirdim): o'rnatilgan `@electric-sql/pglite@0.4.3` (Prisma CLI tranzitiv bog'liqligi, lockfile:445) da
  `PGlite.defaultStartParams = ["--single","-F","-O","-j","-c","search_path=public",...]`. Postgres'da `-F` =
  "fsync() chaqiruvlarini o'chirish; tizim qulaganda ma'lumot buzilish xavfi" (`fsync=off` bilan teng).
  Fayl tizimi `NodeFS` — Emscripten `NODEFS` mount (`dist/fs/nodefs.js`), PGlite o'zi OS-darajali durability
  haqida hech narsa va'da qilmaydi. Plan manbasi 0.5.8 — u yerda o'zgargan bo'lishi mumkin, **0.5.8 da qayta tekshirish shart**.
- Nega tadqiqotdagi `kill -9` testi yetmaydi: jarayon o'ldirilganda OS page cache saqlanadi, yozuvlar yo'qolmaydi.
  Elektr o'chishi / BSOD / "quvvat tugmasini ushlab turish" da fsync'siz yozuvlar va WAL tartibi **yo'qoladi yoki torn page** bo'ladi.
  Buxgalter noutbuki/ofis PC'si uchun bu kutilmagan emas, kundalik hodisa. Pul bazasi (CONSTITUTION §7 ruhi).
- Reja Q-B ni "Sir qabul qiladimi" deb ochiq qoldirgan, lekin qadamlar (1→6) bu javobdan oldin PGlite'ga to'liq yo'naladi
  va zaxira nusxa (`pgDump`) "M9-qadoqlash"ga surilgan — ya'ni birinchi release'da na durability, na backup bo'lishi mumkin.
- Nima qilish kerak:
  1. Step 0 (kod yozishdan oldin, 1 kun): PGlite'ni `startParams` (public option, `.d.ts:510`) bilan `-F`siz ishga tushirib,
     `SHOW fsync; SHOW synchronous_commit; SHOW full_page_writes;` ni yozib olish; NODEFS `fsync` haqiqatan host `fsync`ga yetadimi (Windows'da
     ProcMon/`FlushFileBuffers` kuzatuvi) va yozish tezligi qanchaga tushishini o'lchash.
  2. Power-loss testi: Windows VM'ni hard reset (Hyper-V "Turn off"/VirtualBox "Power off") — yozish paytida, 20+ marta; har ochilishda
     tasdiqlangan yozuvlar yo'qolmaganini va bazaning ochilishini tekshirish. **Go/no-go mezoni reja ichida yozilsin**
     (masalan: 0 buzilish/30 urinish, aks holda embedded-postgres).
  3. Zaxira nusxa (kamida migratsiyadan oldingi snapshot + kunlik `pgDump`) M9 o'zagiga kiritilsin, qadoqlashga surilmasin (qarang M2).
  4. Natija "yo'q" bo'lsa — fallback `embedded-postgres` (qarang M5: u faqat o'zgarmaslik uchun toza almashadigan bo'lsa).

### B2. Acceptance faqat macOS'da, barcha identifikatsiyalangan xavflar Windows'da; tadqiqot talab qilgan Windows spike rejadan tushib qolgan
- `docs/research/windows-packaging.md` §6 "Kodni moslash" 1-qadam: **"Spike (1–2 kun, Windows PC'da)"** va §"Ochiq savollar" 1–9 — hammasi
  Windows. Reja bu spike'ni qadamlar ro'yxatiga olmagan; Q-C ("Windows'da tekshiriladi") ga hech qaysi qadam/acceptance javob bermaydi.
  Acceptance: "macOS'da oyna ochilib ilova ishlaydi" + `dmg`. Bu `@node-rs/argon2` win32 binary, NTFS+antivirus ostida PGlite, NSIS per-user,
  yo'lda kirill/o'zbek harfli Windows foydalanuvchi nomi, Roaming profile (qarang S3), Windows 10 — birortasini tasdiqlamaydi.
- CONSTITUTION §2: "tekshirilmagan narsa tayyor emas". Modul macOS'da "qabul qilinsa" Windows xavflari yashirin qoladi.
- Nima qilish kerak: (a) rejaga "Windows smoke" gate qo'shilsin: haqiqiy Windows 10/11 (yoki kamida `windows-latest` CI + bitta VM) da
  packaged NSIS o'rnatgich → ishga tushish → login → shartnoma yaratish → yopish → qayta ochish → ma'lumot turibdi → Decimal aniq; (b) acceptance'ga
  qo'shilsin; (c) agar Windows PC hozir yo'q bo'lsa — bu **ochiq savol** va Sir'ga ochiq aytilsin, modul "dev-only core" deb nomlansin va
  "Windows tasdiqlandi" alohida status bo'lsin.

---

## Major (should-fix, qurishdan oldin reja tuzatilsin)

### M1. Reja `apps/api` o'zgarishlarini doiraga kiritmagan va "Nest testlari o'zgarmaydi" deydi — bu noto'g'ri
Aslida kerak bo'ladigan o'zgarishlar (hammasi hozir kodda):
- `src/main.ts` — top-level `await bootstrap()` yon ta'sirli modul; Electron uni `import` qila olmaydi. `startServer({dataDir, host, port}) → {port, close()}`
  funksiyasi ajratilishi kerak.
- `src/config/env.ts` — `DATABASE_URL`, `AUTH_PASSWORD_HASH`, `JWT_SECRET` hozir **majburiy** (`str()`), `COOKIE_SECURE` default `true`
  (`raw.COOKIE_SECURE !== 'false'`). Desktop rejimda hammasi `userData`dan keladi; `COOKIE_SECURE=false` rejada yo'q.
- `src/prisma/prisma.service.ts` — `new PrismaPg(...)` qattiq yozilgan; adapter factory + PGlite singleton + `close()` tartibi
  (avval `$disconnect`, keyin `pglite.close()`).
- Statik veb: global prefix `api` + global `AuthGuard` bor; SPA fallback `/api` dan tashqari barcha GET'ni `index.html`ga yo'naltirishi kerak
  (react-router deep link/reload). Express 5 (Nest 12) da wildcard sintaksisi (`{*splat}`) eski `*` dan farq qiladi — `@nestjs/serve-static` bilan
  odatiy tuzoq. Statik fayllar asar ichidan o'qiladi (`send` + asar fs patch — sinash kerak).
- `test/helpers.ts`, `vitest.config.e2e.ts`, `package.json` `pretest:e2e` (`prisma migrate deploy` — PGlite rejimida ma'nosiz) — qarang M3.
- Nima qilish kerak: "Doira" ga `apps/api` bo'limi qo'shilsin va qadamlarga alohida TDD step sifatida yozilsin.

### M2. Migratsiya runner: zaxirasiz, downgrade-himoyasiz, halol "drift" rejasisiz
- `prisma migrate deploy` PGlite'ga ishlamaydi (tadqiqot §2.b) — to'g'ri; o'z runner'imiz kerak. Lekin reja uni "funksiya + testi" deb qo'yadi, quyidagilarsiz:
  1. **Ishga tushishda avtomatik migratsiya = qaytarib bo'lmas operatsiya (CONSTITUTION §5) yagona nusxada.** Migratsiyadan oldin snapshot (ilova yopiq paytda
     papka nusxasi yoki `dumpDataDir`) majburiy. 8 ta mavjud migratsiya bo'sh bazaga tushadi — xavf M8 dagi birinchi sxema o'zgarishida boshlanadi, ya'ni darhol.
  2. **Downgrade/yangi baza + eski ilova**: bazada ilova bilmaydigan migratsiya bor → ilova ishga tushmay, aniq xabar bilan to'xtashi kerak (auto-update
     orqaga qaytsa yoki eski o'rnatgich ustidan o'rnatilsa). Hozir rejada yo'q.
  3. **Migratsiya + `_app_migrations` yozuvi bitta tranzaksiyada** (aks holda yarim qo'llangan migratsiya + yozuvsiz holat → keyingi startda qayta urinish va xato).
     Checksum nomuvofiqligida (`migration.sql` tarixiy o'zgartirilgan) — to'xtash.
  4. **Ikki daftar (ledger)**: dev/CI'da `_prisma_migrations`, PGlite'da `_app_migrations`; SQL fayllar bitta manba — bu yaxshi, drift xavfi past, lekin:
     `schema.prisma` ni o'zgartirib migratsiya yozmasa, PGlite rejimi Prisma client kutgan ustunlarsiz qoladi. Pg rejimidagi `migrate dev`/`migrate diff`
     tekshiruvi (schema ↔ migrations) saqlanishi shart; faqat-PGlite'ga o'tish bu to'rni olib tashlaydi.
  5. Migratsiya SQL fayllari qadoqda qayerda yashaydi? Reja aytmaydi. `prisma/migrations/*` asar ichida emas, `extraResources`da ham emas bo'lsa
     production'da topilmaydi. Eng toza: build vaqtida bundle'ga manifest qilib joylash (fayl yo'lisiz).
  6. Kelajakda `CREATE INDEX CONCURRENTLY`, kengaytma (`pg_trgm`...) kabi PGlite'da bo'lmagan SQL kirib kelsa, faqat PGlite-rejim e2e ushlaydi — CI'da ikkalasi kerak.

### M3. Test strategiyasi: Q-A ga javob berilmagan, `createTestApp`/`resetDb` o'zgarishi ko'rinmaydi
- Hozirgi e2e: 10 fayl, `fileParallelism:false`, bitta umumiy test bazasi (`.env.test` → mahalliy `postgresql://will@localhost`). `.github/` papkasi **yo'q** —
  ya'ni hozir CI umuman yo'q. Reja "CI=pg" deb yozganda mavjud bo'lmagan narsaga tayanadi; Windows CI (`windows-latest`) ham yangi ish.
- `createTestApp` har fayl uchun yangi `AppModule` → yangi `PrismaService` → yangi PGlite. Bir `dataDir`ga ikkita PGlite namunasi = korrupsiya xavfi (PGlite fayl-lock
  qo'ymaydi, deb taxmin qilmang — tekshiring). Yechim: e2e uchun `memory://` + har fayl migratsiya runner (≈ 8 SQL, har fayl +1–3 s WASM startup) —
  to'g'ri, va bu runner'ni haqiqiy yo'lda sinaydi (plus).
- `resetDb` `TRUNCATE TABLE companies CASCADE` — standart Postgres, PGlite'da ishlashi kutiladi; lekin aniq tekshirilmagan.
- **Eng aniq xavf — xato xaritalash.** `companies.service.ts:33`, `contracts.service.ts:140`, `company-import.service.ts:109` Prisma `P2002` ni ushlaydi (unique
  buzilishi → 409). Driver adapter ostida bu `23505` → `UniqueConstraintViolation` xaritasiga bog'liq. `pglite-prisma-adapter` (yagona maintainer) buni
  `@prisma/adapter-pg` kabi bajaradimi — tadqiqot sinamagan (u faqat insert/decimal/count/tx ni sinagan). Xuddi shunday FK (`P2003`) va CHECK buzilishi xatosi
  qanday ko'rinishi (`contracts_dates_order`, `operations_amount_positive`, `invoice_drafts_month_format` regex CHECK). Bu — e2e to'plamining aniq maqsadi.
- Tavsiya (Q-A javobi): **ikkala rejim ham CI'da** (pg: `migrate deploy` + `migrate diff` drift tekshiruvi; PGlite: runner + to'liq e2e). Ikki yo'l divergensiyasi xavfi,
  ikkalasini ham har commit'da yurgizish bilan yopiladi; faqat bittasini qoldirish tavsiya etilmaydi. Lokal dev (Sir macOS): PGlite rejim PostgreSQL o'rnatish
  ehtiyojini olib tashlaydi — bu sof foyda.
- **Tartib**: e2e'ni PGlite'da yurgizish (hozirgi step 3) Electron skeletidan **oldin** bo'lsin. Bu 1 kunlik, hal qiluvchi spike: agar 10 faylning bir qismi
  yiqilsa, butun reja ostidagi taxmin yiqiladi, Electron skeleti esa shu paytgacha behuda.

### M4. Birinchi ishga tushish: parol/hash qayerdan keladi? (yashirin funksiya)
- Doira §3: "`AUTH_PASSWORD_HASH` ... birinchi ishga tushganda yaratiladi". Parol kim tanlaydi? Hozirgi jarayon `pnpm hash-password` + `.env`. O'rnatgichda bu yo'q.
  Tadqiqot §5 (a): buxgalter o'zi belgilaydi. Bu — yangi UI ekran + yangi autentifikatsiyasiz endpoint (`POST /setup`) + "parolni unutdim/almashtirish" oqimi.
  Reja bularni sanamaydi, step 4 faqat "sozlama/sir yaratish + testi" deydi.
- Xavfsizlik: setup endpoint HTTP orqali ochiq bo'lsa, birinchi ishga tushishda **har qanday lokal jarayon yoki DNS-rebinding sayt** parolni oldin egallashi mumkin.
  Yechim: parolni main process dialogi/IPC orqali o'rnatish yoki bir martalik token bilan (URL ichida) himoyalash.
- Parol yo'qolsa nima bo'ladi (lokal bitta kopiya, tiklash yo'q → buxgalter o'z ma'lumotidan chiqib ketadi)? Hech bo'lmasa tray menyusida "Parolni tiklash"
  (OS-foydalanuvchi huquqi bilan, ma'lumotni o'chirmasdan) yoki hujjatlashtirilgan qo'lda yo'l.
- Nima qilish kerak: bu qismni alohida step/acceptance sifatida yozish yoki "M9: parol `userData/config.json`dan; setup UI keyingi bosqich" deb ongli chegara qo'yish.

### M5. D (in-process vs child) va E (port) — reja hal qilmagan, lekin ikkalasi M8 ga ta'sir qiladi; hozir hal qilinishi kerak
**D. Nest + PGlite Electron *main* jarayonida** — PGlite WASM, Prisma query-compiler WASM, `exceljs` (butun Excel xotirada), argon2 callback'lari va foiz yadrosi
(`ro'yxat har so'rovda har shartnoma uchun to'liq yadro`, PROGRESS risk) hammasi main event loop'da. Main = oyna/tray/IPC/menyu. Og'ir so'rov paytida
Windows "Not responding" ko'rsatadi (5 s), M8 da esa main Didox avtomatlashtirishni boshqaradi — kechikib qolishi inson-tezligi qoidasiga (§15) emas, lekin timeout/qotishga olib keladi.
Qo'shimcha: in-process'da unhandled rejection/xato butun ilovani (va tray'ni) yiqitadi, child'da main qayta ishga tushirib, foydalanuvchiga xabar bera oladi.
Child (`utilityProcess`) ham "PGlite bitta egasi" shartini qanoatlantiradi. Narxi: toza o'chirish (main `before-quit` → message → `pglite.close()` → exit, timeout bilan `kill`),
ESM+asar `utilityProcess`da (tadqiqot: TEKSHIRILMADI) va M8 da Nest xizmatlari Electron `webContents`ga to'g'ridan-to'g'ri yeta olmaydi (IPC ko'prik kerak).
Tavsiya: qaror **spike natijasi bilan** qabul qilinsin; minimum — `startServer()` ni jarayon-agnostik funksiya qilib yozish (M1), shunda ko'chirish arzon. Ikkala holatda
Windows `session-end` / NSIS yopish bilan jarayon majburan o'ldirilishi mumkin — shu sababli B1 va snapshot kerak.

**E. Port.** Qat'iy port (31725) uchta real muammo beradi: (1) Windows "Fast User Switching": ikkinchi foydalanuvchi sessiyasidagi nusxa band portni topib, oynasini **boshqa foydalanuvchining serveriga** ulaydi
(bir xil login sahifasi — chalg'ituvchi); (2) begona dastur portni band qilsa — reja "nima qilamiz" deydi, javob yo'q; (3) 127.0.0.1:31725 ga har qanday sayt so'rov yubora oladi (qarang M6).
Eslatma: tadqiqot §1.e dagi "qat'iy origin kerak, chunki E-IMZO API-KEY" sharti yo'l B (Didox o'z sahifasida E-IMZO bilan ishlaydi, ilova ERI'ga tegmaydi — §13) bilan **bekor bo'lgan**:
bizning sahifa E-IMZO'ga ulanmaydi. Demak origin barqarorligi talab emas. Tavsiya: `listen(127.0.0.1, 0)`, port main'ga qaytariladi; bitta qiymat: veb `localStorage` ishlatmaydi (`grep` bo'sh) — origin o'zgarishi zarar qilmaydi.
Agar qat'iy port tanlansa: `/api/health` bilan **instance-id handshake** (main ishga tushirgan tasodifiy token) bo'lmasa oynani ochmaslik.

### M6. Electron xavfsizlik poydevori reja'da yo'q (M8 da remote kontent kelishi sababli hozir kerak)
- `BrowserWindow` `webPreferences` (`contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`), `will-navigate`/`setWindowOpenHandler` (tashqi URL ilova oynasida ochilmasin),
  CSP — rejada bir so'z ham yo'q. M8 da shu jarayon `https://didox.uz` (uchinchi tomon JS) yuklaydi; ikki xavfsizlik zonasi ajratilmagan bo'lsa, Didox sahifasi ilova bilan bir
  preload/IPC'ni ko'radi. Hozir qo'yilgan qoida M8 da qayta yozishdan arzon.
- Localhost serverni begona sayt/jarayon chaqirishi: `Host` sarlavhasini tekshirish yo'q (DNS rebinding bilan login brute-force; hozir login limiti IP bo'yicha 5/daq, rebinding'da
  IP = 127.0.0.1 — hamma uchun bitta chelak, ya'ni qurbonning o'zi ham bloklanishi mumkin). Tadqiqot §5 shuni o'zi tavsiya qilgan; rejaga kiritilsin (Host allow-list + `Origin` tekshiruvi mutatsiyalarda).
- Bir Windows kompyuterida bir nechta OS foydalanuvchisi (RDP/terminal) bo'lsa, loopback port boshqa foydalanuvchiga ham ochiq — himoya faqat login. Parol bo'sh/zaif bo'lmasligi (M4) bilan bog'liq.
- `COOKIE_SECURE=false` rejada ko'rsatilmagan (env default `true`). Chromium loopback'da Secure cookie'ni qabul qilishi mumkin, lekin bunga tayanmang — desktop rejimida aniq `false`.

### M7. Doira keng: bitta modul emas, ikkita (va tray/avtostart — M8 xizmatida)
- **M9a — Lokal DB:** PGlite adapter + migratsiya runner + zaxira snapshot + e2e PGlite'da (Node'da, Electron'siz tekshirish mumkin; Windows CI/VM bilan). Mustaqil qiymat: dev'da PostgreSQL kerak emas.
- **M9b — Electron qobig'i:** `apps/desktop`, `startServer`, statik veb, single-instance, qadoqlash.
- Ajratish nega muhim: M9a muvaffaqiyatsiz bo'lsa (B1/M3), M9b dvigatelni almashtirib (embedded-postgres) davom etadi; birlashtirilganda bitta modulning "qabul"i ikki mustaqil xavfni kutadi.
- Tray + `setLoginItemSettings` (step 5): scheduler yo'q bo'lganda (u M8'ga qoldirilgan) bular faqat xavf qo'shadi — fonda DB egasi bo'lib turadigan jarayon, "oyna yopilsa ham ishlaydi" semantikasi,
  avtostartni foydalanuvchi roziligisiz yoqish, login'da yashirin ishga tushish (`--hidden` argumenti, Windows'da `openAsHidden` yo'q). M8 (tadqiqot §4: "1-kuni ilova bildirishnoma beradi") ehtiyoji paydo bo'lganda qo'shiladi. `requestSingleInstanceLock` esa **hozir** kerak (DB egasi) — qoladi.

### M8. Acceptance tekshirib bo'lmaydigan joylari
- "oyna ochilib ilova (login→shartnomalar) ishlaydi" — qo'lda, vaqt/qadamlari yo'q. Quyidagicha aniqlashtiring: yangi `userData` → setup → login → firma+shartnoma+operatsiya yaratish → hisobot/Excel yuklash.
- "Decimal(18,2) aniq" — qaysi qiymatlar? Tadqiqot ro'yxati: `9999999999999999.99`, `1234567890123456.78`, `0.10`, SUM; shularni e2e'ga doimiy test sifatida qo'shing (hozirgi e2e'da 16+ raqamli qiymat borligini ham tekshiring).
- Yetishmayotgan tekshiruvlar: (1) ikkinchi ishga tushirish birinchisiga fokus beradi, ikkinchi PGlite ochilmaydi; (2) toza chiqishdan keyin qayta ochish — baza buzilmagan (unclean exit: `kill -9` packaged ilovada); (3) migratsiya ikkinchi startda no-op, yangi migratsiya qo'shilsa qo'llanadi, noma'lum (kelajak) migratsiya bor bazada to'xtaydi; (4) band port/DB ochilmasa **ko'rinadigan** xato oynasi + log fayl (hozir rejada xato yo'li umuman yo'q: tray ilovasida oyna chiqmasa foydalanuvchi nima bo'lganini bilmaydi);
  (5) dev va packaged ilova bir `userData`ni bo'lishmaydi (`app.setName` / `-dev` suffix) — aks holda Sir macOS'da dev qilib o'z "prod" bazasiga yoziladi.
- `dmg` — imzosiz/notarizatsiyasiz arm64 ilova Gatekeeper bloklaydi; "dmg ochiladi" uchun qo'lda "Open Anyway" yoki ad-hoc imzo kerakligini qayd qiling (ahamiyatsiz, lekin acceptance'ni "yashil" bo'lmay qoldiradi).

---

## Minor / should-fix kichik

### S1. `@node-rs/argon2` win32 prebuilt macOS'da o'rnatilmaydi (konkret build tuzog'i)
`@node-rs/argon2-win32-x64-msvc` — `os`/`cpu` filtrli optionalDependency. pnpm macOS'da faqat host platformani (darwin-arm64) o'rnatadi; shuning uchun macOS'dan `electron-builder --win`
yig'ilsa, `.node` fayli o'ramga **tushmaydi** va ilova Windows'da login'da yiqiladi (kutilgan emas: "Cannot find native binding"). Yechimlar: `pnpm-workspace.yaml` ga
`supportedArchitectures: { os: [darwin, win32], cpu: [x64, arm64] }` yoki faqat `windows-latest` CI'da qurish (tadqiqot ham tavsiya qilgan). Rejadagi "to'g'ri bundle qilinadi" bu aniqlikda emas.
`.node` fayllarni electron-builder avtomatik `asarUnpack` qiladi, lekin dmg/NSIS ichida tekshiring.

### S2. Qadoqlash uslubi (pnpm monorepo) — tanlanmagan
Tadqiqot ikki yo'lni ko'rsatgan (`node-linker=hoisted` yoki `pnpm deploy`/esbuild bilan bitta papka). Reja birini ham tanlamagan. Real qiymatlar: `@prisma/client/runtime` 71 MB (barcha dialektlar) — `files` filtri;
generated client `src/generated/prisma` gitignored va `postinstall: prisma generate`ga bog'liq — desktop build `generate → nest build → web build → electron-builder` tartibini kafolatlashi kerak;
generated client `@prisma/client/runtime/query_compiler_fast_bg.postgresql.wasm-base64.mjs` ni dinamik `import()` qiladi (`internal/class.ts:51`) — esbuild bilan bundle qilinsa bu yo'lni `external` qoldirish yoki kiritish aniq belgilansin.
Q-C ga javob: Prisma 7 query-compiler WASM `.mjs` ichida **base64** (alohida `.wasm` fayl yo'q) — asar muammosi kutilmaydi; lekin bu faqat Windows packaged build'da bir marta tasdiqlanadi (B2).

### S3. `userData` Roaming'da (`%APPDATA%`) — bazani Local'ga qo'ying
`app.getPath('userData')` Windows'da `%APPDATA%\<ilova>` (Roaming). Domen/roaming profile'li ofis kompyuterlarida Roaming papka login/logout'da serverga sinxronlanadi — 40+ MB PGlite
papkasi, ochiq fayl bilan nusxalash va yarim holatda sinxronlash. Baza va zaxira `app.getPath('appData')` emas, `%LOCALAPPDATA%` ostida bo'lsin (`app.setPath('userData', ...)`).
Kirill/o'zbekcha foydalanuvchi nomi (`C:\Users\Алишер\...`) bilan NODEFS yo'lini Windows'da sinash (B2 smoke'ga qo'shing). Antivirus real-time scan PGlite fayllariga (ko'p kichik yozuvlar) — sekinlashtirishi mumkin.

### S4. Yopilish tartibi va `before-quit`
`app.enableShutdownHooks()` (`app.setup.ts:15`) Nest'ni signal bilan yopadi, lekin Electron Windows'da SIGTERM yubormaydi. `before-quit` da `preventDefault → await app.close() (→ Prisma $disconnect → pglite.close()) → app.exit()`
qo'lda kerak; timeout bilan. Step 1 testi aynan shuni qamrab olsin (yopish tugamasa — jarayon osilib qolmasin, lekin DB ham yarim yopilmasin).

### S5. PGlite versiyalari va adapter juftligi
- Lockfile'da PGlite 0.4.3 (Prisma CLI tranzitivi) allaqachon bor; reja 0.5.8 ni ishlatadi → `apps/api`da **aniq (exact) pin**, aks holda peer (`>=0.2.0`) ikkinchisiga bog'lanib ketishi mumkin.
- `package.json`da `@prisma/client`, `prisma`, `@prisma/adapter-pg` exact `7.10.0`; `pglite-prisma-adapter@0.7.2` (2026-01, peer `>=7.1.0`) Prisma minor yangilanishida driver-adapter interfeysi o'zgarsa buziladi — Prisma yangilash e2e(PGlite) yashil bo'lmaguncha taqiqlansin.
- PGlite data-dir PG major'iga bog'liq (18.x). Bazada `PG_VERSION`/PGlite versiyasi markeri va mos kelmasa ochmaslik + dump/restore yo'li (B1/M2 zaxirasiga bog'liq).
- Boshqa Postgres'ga chiqish (embedded-postgres) — data-dir ko'chirib bo'lmaydi; faqat `pgDump → restore`. "Chiqish strategiyasi" shu yo'lni **bir marta sinab ko'rmaguncha** haqiqiy emas.

### S6. Tarmoq/jarayon tafsilotlari
- `listen('127.0.0.1')` — to'g'ri (IPv6 `::1`/`localhost` farqi va Firewall oynasi chiqmaydi). Oynani ham aynan `http://127.0.0.1:PORT` ga yo'naltiring (`localhost` emas) — cookie host'i bir xil bo'lsin.
- Sovuq start: PGlite initdb (bo'sh papka ~39 MB) + 8 migratsiya + Nest DI + Prisma WASM — soniyalar. Oyna ochilishidan oldin splash/"yuklanmoqda" kerak, aks holda `ERR_CONNECTION_REFUSED` oq ekrani.

---

## Nice-to-know

- Electron 30+ da `BrowserView` deprecated; M8 uchun `WebContentsView` + alohida `session.fromPartition('persist:didox')` ishlating (Didox cookie'lari ilova oynasi bilan aralashmasin). Hozirgi shell shuni to'sib qo'ymasin.
- Alternativ (sinalmagan): PGlite + `@electric-sql/pglite-socket` (Prisma `prisma dev` shu bilan ishlaydi — lockfile:5987) + rasmiy `@prisma/adapter-pg` — jamoa adapteri yo'qoladi va `prisma migrate deploy` ishlashi mumkin; evaziga loopback TCP portda bitta-ulanishli server va Prisma CLI qadoqlash masalasi. B1 dagi fsync muammosini hal qilmaydi, faqat adapter xavfini kamaytiradi. B1 spike paytida 30 daqiqalik tajriba arziydi.
- Sequencing "M9 M8 dan oldin": **to'g'ri**, chunki M8 uchun Electron `webContents` shart. Lekin M8 ning markaziy taxmini — Electron Chromium'ida didox.uz ishlaydi, ERI login E-IMZO `wss://127.0.0.1:64443` bilan o'tadi, Didox embedded Electron'ni bloklamaydi — hali hech qayerda tekshirilmagan (tadqiqot ochiq savol #2). Shu savolni **M9 Windows spike bilan birga** (bo'sh Electron + didox.uz + haqiqiy E-IMZO) 1 kunda yopib qo'ying: javob "yo'q" bo'lsa, M9b ning butun asosi (Electron) qayta ko'riladi. Bu M8 ni boshlamasdan, faqat shell'ni asoslaydi.
- M8 shell'dan nimani hozir talab qiladi: (1) Didox uchun alohida session/partition (M6); (2) `certificate-error`/`setCertificateVerifyProc` faqat `127.0.0.1:64443` va faqat Didox session'ida (Chromium OS sertifikat do'konini ishlatadi — E-IMZO root o'rnatilgan bo'lsa kerak bo'lmasligi mumkin); (3) `powerMonitor` main'da — D qaroriga bog'liq emas; (4) agar Nest child'da bo'lsa, Didox boshqaruvi uchun main↔Nest port interfeysi. Boshqa cheklov yo'q.
- Tray ikonka `.ico` (Windows) va `nativeImage`; `requestSingleInstanceLock` `second-instance` handler'i oynani ko'rsatishi (yashirin tray'dan) kerak — M7 ga qarab keyinroq.

---

## Tekshirilgan va yaxshi

- Dvigatel tanlovi dalilga tayanadi: SQLite `Decimal` yo'qotishi tajribada ko'rsatilgan (`…99`→`…98`); PGlite 8/8 haqiqiy migratsiya, Decimal(18,2) aniqligi, `aggregate _sum`, tranzaksiya va `kill -9` (0 yo'qotish) tajribada tekshirilgan. Qaror asoslangan.
- Kod PGlite uchun qulay: `src/` da xom SQL va `$transaction` **yo'q** (faqat `test/helpers.ts:31` `TRUNCATE ... CASCADE`); interaktiv tranzaksiya yo'qligi bitta-ulanishli PGlite'da "tx ichida tx tashqarisidagi client'ni chaqirish" deadlock xavfini hozircha yo'qqa chiqaradi. (Kelajak: M8 scheduler yozilganda bu qoida eslatilsin.)
- Sana mantig'i vaqt zonasiga bog'liq emas: `toDbDate/fromDbDate` UTC yarim tun, "bugun" — Asia/Tashkent (`Clock`). PGlite `DATE` ustunini JS `Date`ga parse qilishi tufayli bu hal qiluvchi; qo'shimcha xavfsizlik uchun e2e'ni `TZ=UTC` va `TZ=America/New_York` bilan PGlite'da bir marta yurgizing (adapter DATE'ni mahalliy vaqt bilan o'qimasligini isbotlash uchun) — arzon, lekin pul/foiz hisobi kun bo'yicha ketadi.
- Cookie/CORS: veb `/api` ni nisbiy yo'l bilan chaqiradi, Nest'da CORS yo'q, `SameSite=Lax`, `httpOnly` — same-origin `http://127.0.0.1:PORT` uchun mos; cookie port bo'yicha ajratilmagani sababli ephemeral port sessiyani buzmaydi (JWT siri `userData`da saqlansa).
- `127.0.0.1` ga bog'lash, `requestSingleInstanceLock`, NSIS per-user (adminsiz), Electron 44 (Node 24 — loyiha bilan bir xil), ESM main (Electron ≥28) — to'g'ri qarorlar.
- Prisma 7 Rust-free: `.node` engine yo'q, WASM base64 → asarUnpack Prisma uchun kerak emas. `@node-rs/argon2` N-API (ABI-barqaror, `electron-rebuild` kerak emas) — faqat S1 tuzog'i.
- Doiradan tashqari ro'yxati (updater, signing, backup-UI, scheduler, E-IMZO) aniq; YAGNI bo'yicha yaxshi (istisno: tray/avtostart — M7; zaxira — aksincha, ichkariga kirsin).

## Ochiq savollar (Sir/reja muallifi uchun)

1. Hozir haqiqiy Windows 10/11 kompyuter (yoki VM + hard reset imkoni) mavjudmi? B1/B2 shunga bog'liq.
2. Bir buxgalter PC'sida bir nechta Windows foydalanuvchi/RDP bormi (M6 va M5-E uchun)?
3. Parol tiklash: "parol yo'qolsa ma'lumot yo'qoladi" Sir'ga qabul qilinadimi, yoki OS-hisob huquqi bilan tiklash yo'li kerakmi (M4)?
4. PGlite 0.5.8 `defaultStartParams` da `-F` hamon bormi va NODEFS `fsync` ni bajaradimi — men faqat 0.4.3 ni o'qidim (B1).
5. Hozir mavjud (server'da yoki dev'da) ma'lumotni lokal PGlite'ga ko'chirish kerakmi? Reja import yo'lini aytmaydi (PROGRESS bo'yicha prod server yo'q, ehtimol kerak emas — tasdiqlang).
