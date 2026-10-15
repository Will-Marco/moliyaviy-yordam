# M13 — Umumiy server: bir nechta buxgalter, bitta ma'lumot (reja v2)

> **Holat:** **qabul qilindi (Sir, 2026-10-15)** — v2 shu holicha; robot faqat lokal boshlanadi (§5), har ERI kaliti
> bitta kompyuterda (§7.4). Hujjatlar yangilandi; keyingisi — 13a (domen va tashqi zaxira joyi kerak, §7.2).
> **Sabab:** Sir (2026-10-14): *"Ilovani bir nechta buxgalterlar ishlatishadi va undagi xabarlar barchaga ko'rinib
> turishi kerak… hamma ma'lumot ko'rinishi kerak, B variant maqul."*
>
> Bu **CONSTITUTION §16 va SRS §1 dagi asosiy qarorni o'zgartiradi** ("ilova buxgalter kompyuterida lokal ishlaydi;
> har buxgalterga alohida o'rnatiladi", 2026-10-11). Reja qabul qilinsa, avval hujjatlar yangilanadi, keyin kod.
>
> **v2 (2026-10-14):** Sir "overengineering kerak emas" dedi → IP ruxsat ro'yxati, VPN, alohida hisoblar va oy qulfi
> jadvali **olib tashlandi**. O'rniga uchta arzon tuzatish qoldi (§4.2: robot kaliti, server yo'qida to'xtash,
> ko'chish bir qadamda) — bularsiz reja bugun qabul qilingan ishni (FR-8.5, FR-8.10) buzadi.

## 1. Sir qarorlari (2026-10-14)

| Savol | Qaror |
|---|---|
| Server qayerda | **Kichik VPS** — mijoz oladi va to'laydi, biz sozlaymiz |
| Buxgalterlar qayerdan ulanadi | Amalda ofisdan, lekin **IP cheklovi yo'q** ("overengineering kerak emas") |
| Foydalanuvchi hisoblari | **Ortiqcha narsa shart emas** — bitta umumiy kirish, admin sahifasi yo'q |
| Didox roboti | **Har bir buxgalterda** (har kimning o'z ERI kaliti bilan) |
| Internet uzilsa ish to'xtashi | **Qabul qilindi** |

## 2. Hozir qanday (va nega o'zgaradi)

Ilova — Electron qobig'i; u o'z ichida **API'ni child-process'da** ko'taradi va ma'lumotni **o'sha kompyuterdagi
PGlite** bazasida saqlaydi (M9a/M9b). Kirish — birinchi ishga tushirishda yaratilgan bitta login/parol,
`userData/config.json` da argon2 hash bilan. Ya'ni **har o'rnatma — alohida dunyo**. Didox natijalari ham lokal
fayllarda (`userData/didox-runs`, `didox-skips.json`).

Talab o'zgardi: ma'lumot **bitta** bo'lishi kerak. Demak baza va API bitta joyda turadi, ilova esa unga mijoz bo'ladi.

## 3. Nishon arxitektura

```
   VPS (Ubuntu, docker compose) — eng kichik tarif yetadi
   ├─ postgres        ← yagona baza
   ├─ api (Nest)      ← bugungi API, DB_DRIVER=pg, tashqariga port chiqarmaydi
   └─ caddy           ← https (sertifikat avtomatik), faqat shu port ochiq

   Buxgalter kompyuteri (Windows)
   ├─ brauzer         → https://<server> (web ilova, serverdan beriladi)
   └─ desktop ilova   → o'sha URL'ni o'z oynasida ochadi + Didox roboti (E-IMZO, autotype)
                         API'ni ko'tarmaydi, lokal baza yo'q
```

**Desktop ilova o'z rolini o'zgartiradi:** u endi "ilova + baza" emas, **"E-IMZO'li brauzer"**. Bitta UI (serverdagi
web), bitta baza (serverdagi postgres). Lokal qoladigan narsa — faqat kompyuterga bog'liq bo'lgani: E-IMZO kalitlari,
ERI parollari (`safeStorage`), Didox oynasi, run jurnali va diagnostika screenshot'lari.

## 4. Nima o'zgaradi — qism-qism

### 4.1 API (eng kam o'zgarish)
- `DB_DRIVER=pg` bilan ishlaydi (allaqachon qo'llab-quvvatlanadi, e2e ikkala drayverda yashil).
- **Migratsiya:** serverda `prisma migrate deploy`. Ilova ichidagi runner (`_app_migrations`) faqat PGlite uchun —
  serverda ishlatilmaydi. Deploy'dan **oldin** `pg_dump` olinadi (CONSTITUTION §5: sxema o'zgarishidan oldin snapshot).
- **Kirish:** bugungidek bitta login/parol, lekin serverda: `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` **env'da**
  (`pnpm hash-password` bor). Alohida `app_config` jadvali qilinmaydi — parolni o'zgartiradigan sahifa yo'q.
- **Yangi jadval:** `didox_invoice_flag` — `month`, `contract_id`, `state` (`needs_check` | `skipped`), `code`,
  `message`, `didox_document_id?`, `candidate_ids?`, `run_id`, `created_by_install`, `created_at`, `resolved_at?`.
  Shu jadval tufayli bir buxgalter ko'rgan "e'tibor kerak" hammada ko'rinadi.
- **Robot kaliti:** serverda `ROBOT_SECRET` (env). Desktop shu sir bilan o'ziga qisqa muddatli token yasaydi —
  ya'ni `apps/desktop/src/api/client.ts` bugungidek qoladi. Sabab §4.2 da.
- **Zaxira:** `pg_dump` cron (kunlik, 14 kun + oylik). Hozirgi `BackupService` PGlite `dumpDataDir` ga tayangan —
  serverda u ishlamaydi, shuning uchun zaxira cron'da. `BackupMenu` (web) lokal papkani o'qiydi → server rejimida
  **yashiriladi** (yolg'on "zaxira bor" ko'rsatmasligi uchun).
- `TRUST_PROXY=1` — Caddy ortida `req.ip` proxy'ning manzili bo'lib qolmasligi uchun. Aks holda `LoginLimiter`
  butun ofisni bitta chelakka soladi: bir kishining xato parollari hammani bloklaydi.
- Docker compose'da API porti **publish qilinmaydi** (`expose`, `ports` emas) — aks holda https'ni aylanib o'tib
  API'ga to'g'ridan-to'g'ri kirish mumkin bo'ladi.

### 4.2 Desktop
- **API'ni ko'tarmaydi.** `startApi`, PGlite, `WEB_ROOT`, first-run parol oynasi **olib tashlanadi** (lokal rejim
  flag ortida ham qoldirilmaydi: Didox bayroqlari bir rejimda faylda, boshqasida serverda bo'lishi — eng xatarli
  kodni ikki barobar qiladi). PGlite drayveri `test:e2e:pglite` uchun API'da qoladi, bu alohida masala.
- **Birinchi ishga tushirish:** server manzili so'raladi va saqlanadi. `http://` qabul qilinmaydi (faqat `https://`) —
  `isTrustedSender` va `COOKIE_SECURE` shunga tayanadi.
- **Robot sessiyasi — buxgalterning cookie'si emas, o'zining kaliti.** Oynaning cookie'siga tayanish M8d jadvalini
  o'ldiradi: sessiya 12 soatlik (`SESSION_TTL_SECONDS`), avtomatik run esa oy 1-kuni 06:00 da, buxgalter
  kompyuterdan uzoqda bo'lganda ishlaydi — o'sha paytda hech kim kirgan bo'lmaydi va ilova tray'da, oynasiz turadi.
  Shuning uchun desktop `ROBOT_SECRET` bilan o'ziga token yasaydi (bugungi mantiq) — uzoq run o'rtasida sessiya
  tugab qolmaydi.
- **Server yo'q bo'lsa — to'xtaydi, davom etmaydi.** Hozir `runFirm` ro'yxatni qayta o'qiyolmasa xatoni yutib,
  eski reja bilan davom etadi (`create-drafts.ts:242`). Lokal bazada bu xavfsiz edi; umumiy serverda bu — Didox'da
  ikkinchi qoralama. Qoida: **ro'yxat o'qilmasa yoki belgilash yozilmasa, o'sha firma to'xtaydi** (hech narsa
  yaratilmagani — har doim xavfsiz tomon). Sabab aniq o'zbekcha yoziladi.
- **Bayroqlar/skiplar** lokal fayldan API'ga ko'chadi (§4.1). Run jurnali va screenshot'lar **lokal qoladi**
  (FR-8.7) — natijaning o'zi (bayroq, Didox ID) serverga yoziladi.
- **Jadval (M8d):** `NOTHING_TO_DO` bilan tugagan run ham **lokal urinish sifatida yoziladi**. Aks holda ishi
  tugagan oy uchun tray'da "Didox qoralamalari kutmoqda" cheksiz turadi (`isRunDue` lokal urinishlarga qaraydi).
- **Tiklash egasi:** uzilgan saqlashni faqat **o'sha** kompyuter tiklay oladi (lokal `savingAt` + o'sha firmaning ERI
  kaliti). Shuning uchun bayroqda `created_by_install` bor va fakturalar ro'yxatida "bu fakturani <kompyuter> dagi
  buxgalter tekshirishi kerak" deb yoziladi.

- **P6 qarorlari (Sir, 2026-10-15):** ERI paroli lokal oynada; run sahifadan so'raladi, lekin OS tasdiq oynasi bilan
  boshlanadi; robot `ROBOT_SECRET` ning o'zini emas, login'dan keyin serverdan olingan 180 kunlik tokenni saqlaydi
  (`safeStorage`) — PROGRESS qaror jurnali.

### 4.3 Web
- O'zgarish deyarli yo'q: u allaqachon `/api` orqali gaplashadi va Nest uni statik beradi.
- Didox bayroqlari endi API'dan keladi (desktop bridge o'rniga); desktop bridge faqat **run boshlash/kuzatish** uchun
  qoladi. Oddiy brauzerda (desktop'siz) bayroqlar ko'rinadi, screenshot'lar — yo'q.

### 4.4 Ma'lumot ko'chirish
**Yo'l tanlandi (eng sodda va eng kam xatarli):** serverda bo'sh bazaga `prisma migrate deploy`, keyin **faqat
ma'lumot** bir martalik skript bilan ko'chiriladi (firmalar → shartnomalar → operatsiyalar → stavkalar → qoralama
belgilari, FK tartibida). PGlite `dumpDataDir` nusxasini serverga tiklash **qilinmaydi**: u SQL emas, data-katalog —
postgres versiyasi mos kelishi shart, ustiga `_app_migrations` va `_prisma_migrations` ikki xil jurnal bo'lib,
`migrate deploy` to'la bazaga migratsiyalarni qaytadan qo'yishga urinadi.

Shu bilan birga ko'chadi: `didox-skips.json` va jurnalda **hal qilinmagan** `needs_check` yozuvlari → `didox_invoice_flag`.
Aks holda umumiy rejimdagi birinchi run buxgalter ataylab o'tkazgan fakturalarni qaytadan oladi.

## 5. Xavfsizlik — sodda, lekin bo'sh emas

Sir qarori: IP cheklovi, VPN, alohida hisoblar — **yo'q**. Shunga ko'ra himoya arzon choralardan iborat:

1. **https majburiy** (Caddy + Let's Encrypt, avtomatik yangilanadi), `http` → `https`, cookie `secure`.
2. **Kirishga urinish cheklovi** — `LoginLimiter` **allaqachon bor** (5 xato urinish / 60 s, bitta IP uchun).
   Qo'shiladigan narsa: `TRUST_PROXY=1` (§4.1) — aks holda cheklov butun ofisga bitta bo'lib ishlaydi.
3. **Uzun parol** (kamida 16 belgi) — umumiy parol yagona to'siq bo'lgani uchun.
4. Serverga SSH faqat kalit bilan.
5. **Zaxira serverdan tashqariga ham** — haftada bir marta. Bitta VPS = bitta disk: u buzilsa baza ham, zaxira ham
   birga ketadi. Bugun ma'lumot Sir noutbukida va `userData/backups` da — ya'ni faqat VPS'da saqlash **bugundan
   yomonroq**. Qayerga nusxa olish — Sir aytadi (§7.2).
6. **Sessiyani bekor qilish:** `logout` JWT'ni bekor qilmaydi. Umumiy parol bilan yagona "o'chirish tugmasi" —
   `JWT_SECRET` ni o'zgartirib API'ni qayta ishga tushirish; runbook'ga bitta qator sifatida yoziladi.

**Shaklini o'zgartiradigan xavf (CONSTITUTION §13 ga qo'shiladi):** bugun desktop oynasi o'z kompyuteridagi
bundle'ni ochadi va preload `eri:set-password`, `didox:create-drafts` ni shu origin'ga ishonib beradi. Serverdan
keyin bu origin — internetdagi VPS. Ya'ni serverga biror yo'l bilan skript kiritilsa, u **har bir buxgalterning
ERI kaliti bilan** Didox'ga kirishni so'rashi mumkin. §13 "parol + .pfx bitta kompyuterda" xavfini qabul qilgan,
buni emas. Arzon yumshatish: **robot faqat tray menyusidan yoki lokal oynadan boshlanadi**, serverdagi sahifa esa
holatni **faqat ko'rsatadi** — shunda "sahifa mening kalitimdan foydalanishni so'rashi" umuman qolmaydi.

**Ochiq qabul qilingan xavf:** server internetda ochiq va uni bitta umumiy parol himoya qiladi; kim nima kiritgani
yozilmaydi. Keyinchalik alohida hisoblar kerak bo'lsa, bu reja buzilmaydi.

## 6. Bosqichlar (har biri alohida qabul qilinadi)

| Bosqich | Nima | Natija / gate |
|---|---|---|
| **13a** | Server muhiti: docker compose (postgres + api + caddy), `migrate deploy`, https, `pg_dump` + tashqariga nusxa | Brauzerdan `https://…` ochiladi, kirish ishlaydi; **zaxira haqiqatda bo'sh bazaga tiklab ko'riladi** (runbook yangilash — dalil emas) |
| **13b** | **Ko'chish (bir qadamda):** ma'lumot + Didox bayroqlari serverga, desktop mijozga aylanadi, eski ilova Sir mashinasidan olib tashlanadi | Serverdagi raqamlar bugungi bilan bir xil; Didox roboti ishlaydi |
| **13c** | Umumiy bayroqlar UI'si, jadval tuzatishlari (§4.2), tiklash egasi ko'rsatiladi | Bir buxgalter ko'rgan holat hammada ko'rinadi, tray behuda bezovta qilmaydi |

**Nega 13b bitta qadam:** ma'lumotni ko'chirib, desktop'ni keyin almashtirsak, oradagi vaqtda Sir mashinasi hamon
**lokal bazaga yozadi** — u yozgan narsa yo'qoladi, boshqalar yozgani unga ko'rinmaydi. Shuning uchun: ma'lumot
kiritish to'xtatiladi → ko'chiriladi → **raqamlar bilan** tekshiriladi (jadvallardagi qator soni + SRS mos
raqamlari: yanvar 2026 = 552 328,77; Yanvar–Fevral: 60 mln / 15 mln / 1 035 616,44 / qoldiq 45 mln) → yangi build
o'rnatiladi, eskisi olib tashlanadi. **Eski lokal baza bir oy tegilmagan holda saqlanadi** — biror narsa chiqsa
orqaga qaytamiz.

Har bosqichdan keyin: `pnpm test`, brauzerda tekshiruv, Sir gate. 13a va ko'chish — **Sir huzurida** (CONSTITUTION §5).

## 7. Xavflar va ochiq savollar

1. **Internet uzilsa ilova ishlamaydi** — Sir qabul qildi. (Yumshatish: faqat o'qish uchun kesh — bu rejada yo'q.)
2. **Zaxira qayerga ketadi** (§5.5) va **domen nomi** qanday bo'ladi — Sir aytishi kerak. VPS'ni mijoz beradi,
   SSH kaliti/domen Sir qo'lida qoladi, sozlashni biz qilamiz.
3. **Bir vaqtda tahrirlash**: ikki buxgalter bitta shartnomani tahrirlasa oxirgisi yutadi. Qoralama belgilashda
   shartli yozish bor (409), qolgan joylarda yo'q. Kim nima o'zgartirgani ham yozilmaydi (Sir: ortiqcha narsa shart
   emas). Kerak bo'lsa alohida ish sifatida qo'shiladi.
4. **Didox roboti har kimda** → ikki robot bitta oyni bajarib qo'ymasligi uchun **oy qulfi jadvali qilinmaydi**
   (soddalashtirish). Tayanch: (a) har kompyuter faqat **o'zida ERI kaliti bor** firmalarni oladi, kalitsizni
   o'tkazadi; (b) reja umumiy bazadan o'qiladi va §4.2 bo'yicha server yo'qida to'xtaydi; (c) 0-qadam Didox'ning
   **o'z ro'yxatini** o'qiydi (FR-8.5) — bu kompyuterlar orasida ham ishlaydi, chunki manba Didox'ning o'zi.
   **Shart: bir xil ERI kaliti ikki kompyuterda ishlatilmasin.** Shu shart buzilsa, qulf masalasi qaytadan ko'riladi.
5. **M8d jadvali** serverga bog'liq: oy 1-kuni server o'chiq bo'lsa run boshlanmaydi (keyin tutib oladi).
6. **Versiyalar ajralib ketishi:** o'rnatmalar qo'lda yangilanadi (A3), ya'ni serverda eski va yangi desktop birga
   ishlashi mumkin. Hozircha qabul qilinadi; muammo chiqsa `GET /api/version` + minimal versiya tekshiruvi qo'shiladi.

## 8. Bu reja nimani o'zgartirmaydi

Didox roboti (M8a–M8d), E-IMZO, autotype, forma to'ldirish, screenshot'lar — hammasi o'z joyida. O'zgarishi:
ma'lumotni qayerdan o'qishi va natijani qayerga yozishi. Ilova hamon **hech qachon** "Имзолаш"/"Юбориш" bosmaydi.

## 9. Hujjatlarga tegadigan joylar (reja qabul qilinsa)

CONSTITUTION §5 (serverdagi snapshot), §13 (masofaviy origin xavfi), §16 (lokal → server), Tech stack ("Infra:
lokal o'rnatish" → server); SRS §1, §2, §7, Modul 9 sarlavhasi ("server yo'q"), FR-8.7, FR-8.10, FR-9.x.

## 10. P6b (desktop → server mijozi) — rejadan farqlar (2026-10-15)

- **Robot kaliti serverdan olinadi** (Sir qarori, 2026-10-15; §4.1/§4.2 dagi "desktop `ROBOT_SECRET` bilan o'zi yasaydi"
  o'rniga): buxgalter kirgan paytda main uning `session` cookie'si bilan `POST /api/auth/robot-token` so'raydi, javobni
  `safeStorage` bilan saqlaydi (`userData/robot-token.json`); yo'q bo'lsa, 30 kundan kam qolsa yoki API 401 bersa —
  keyingi kirishda yangilanadi. Kalit yo'q bo'lsa run boshlanmaydi: "Ilovaga qayta kiring — robot kaliti yo'q yoki eskirgan".
- **Kompyuter nomi** (`createdByInstall`) — `<hostname> (<installId ning 8 belgisi>)`. Ko'chishda (`migrate-data.ts
  --install`) yozilgan bayroqlar boshqa nom bilan turadi, shuning uchun o'sha kompyuterda ham "… dagi buxgalter
  tekshirishi kerak" deb ko'rinadi (tiklash baribir lokal jurnal bo'yicha ishlaydi).
- **O'tkazib yuborish brauzerdan ham** mumkin (bayroq serverda; nom — "Brauzer").
- Robot qoralamani belgilagan fakturada serverdagi "e'tibor kerak" bayrog'i yopiladi (eski `journal.flags` ham shunday
  qilardi); buxgalter serverda yopgan bayroqni tiklash qayta qidirmaydi va qayta ochmaydi.
- Server javob bermasa jadval urinishi **yozilmaydi** (oy yopilmaydi, urinishlar soni ham sarflanmaydi) — server
  qaytguncha har soatda qayta qaraladi.
