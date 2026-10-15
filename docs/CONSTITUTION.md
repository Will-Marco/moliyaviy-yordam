# CONSTITUTION — Moliyaviy yordam: foiz hisobi

> O'zgarmas tamoyillar. Har o'zgarish shularga bo'ysunadi. Jarvis bularni hech qachon buzmaydi.
> O'zgartirish faqat Sir ruxsati bilan.

## Muhandislik tamoyillari
1. Doim eng **optimal, professional va clean** yo'l.
2. **Halollik:** taxmin yo'q; tekshirilmagan narsa "tayyor" emas.
3. **TDD** — test-first (red → green → refactor).
4. **Module-by-module** — har modul Sir tomonidan qabul qilinadi.
5. Qaytarib bo'lmas operatsiya (deploy/migrate/delete/secret) — faqat Sir ruxsati bilan. Server bazasida migratsiya yoki
   deploy'dan **oldin** `pg_dump` snapshot olinadi (M13, 2026-10-15).
6. Avtonomiya: kod yozishda erkin, arxitektura/muhim qaror oldidan so'rash.

## Moliyaviy aniqlik (bu loyihaning eng muhim qonuni)
7. Pul va stavka **hech qachon `float`/`number`** bilan hisoblanmaydi — DB'da `Decimal`, kodda decimal kutubxona
   yoki butun son (BigInt: tiyin, stavka ×10⁴). Decimal → BigInt faqat `toFixed()` orqali. (Sir, 2026-10-07)
8. Hisoblash qoidalari faqat `SRS.md §4` (CR-1…CR-11) dan olinadi. Qoida o'zgarsa — avval SRS, keyin test, keyin kod.
9. Foiz yadrosi — **sof funksiya**, DB/HTTP/vaqtga bog'liq emas ("bugun" parametr sifatida beriladi).
10. Har CR qoidasi kamida bitta test bilan qoplanadi; SRS'dagi etalon misol (yanvar = 552 328,77) doim yashil.
11. Ekran, Excel va faktura **bitta** yadro natijasidan oladi — raqam ikki joyda alohida hisoblanmaydi.

## Didox (qat'iy chegaralar) — 2026-10-11 da Sir qarori bilan qayta yozildi (yo'l: B — brauzerni boshqarish)
> Rasmiy partner token yo'q. Didox'ning o'z partner tokenini uning kodidan sug'urib olish **taqiqlangan**
> (uchinchi tomon kalitini o'zlashtirish). Yo'l B: ilova Didox saytini **o'z oynasida** ochadi, Didox'ning o'z login
> sahifasi orqali ERI (E-IMZO) bilan kiradi va shu sessiyani boshqaradi (forma to'ldirish / Excel yuklash → qoralama).
> 2026-10-12: kirish **avtomatik** — Sir qarori (§13).
12. Ilova **hech qachon** hujjatni imzolamaydi va yubormaydi — faqat qoralama yaratadi (`tosign`/`sign` yo'q, "Юбориш" bosilmaydi).
13. **ERI paroli ilovada saqlanadi — faqat avtomatik kirish uchun** (2026-10-12, Sir qarori; imzolash xavfi ongli qabul
    qilingan: parol + `.pfx` bir kompyuterda → texnik jihatdan imzolash mumkin bo'ladi, §12 kod intizomi bilan ushlanadi).
    - Parol faqat **OS shifri** bilan saqlanadi (Electron `safeStorage`: Windows DPAPI / macOS Keychain) — ochiq matn diskda,
      log'da, xato xabarida, tarmoqda, UI'da (kiritilgandan keyin) **hech qachon** yo'q. Hash emas: parol qayta ochilishi shart.
    - Parol faqat bitta joyda ishlatiladi: Didox login paytida **E-IMZO'ning o'z parol oynasiga** yoziladi. Ilova E-IMZO'ning
      imzolovchi funksiyalarini (`create_pkcs7` va h.k.) o'zi **chaqirmaydi**; E-IMZO'dan faqat kalit ro'yxatini o'qiydi.
    - `.pfx` fayli E-IMZO'da qoladi — ilova uni o'qimaydi, ko'chirmaydi. "Запомнить на 6 час." belgisi qo'yilmaydi.
    - Parol xato bo'lsa — to'xtash, firmani "parol xato" deb belgilash, **qayta urinish yo'q** (§15).
    - **M13 (Sir, 2026-10-15):** UI serverdan (internetdagi origin) keladi. Shuning uchun Didox'ga kirishni boshlaydigan har
      amal ("Kirishni tekshirish", qoralama yaratish) **faqat desktop ilovaning o'zidan** — tray menyusi yoki lokal oyna;
      serverdagi sahifa robot holatini **faqat ko'rsatadi**. Server buzilsa ham u buxgalterning ERI kaliti bilan kirishni so'ray olmaydi.
    - **Qabul qilingan qoldiq xavf (M13, 2026-10-15):** oy 1-kungi **jadval** tasdiqsiz ishlaydi va nima yaratishni serverdan
      oladi. Server buzilsa, u shu kompyuterda ERI paroli saqlangan firmalar nomidan Didox'da **soxta qoralamalar** yaratdira
      oladi (imzolay ham, yubora ham olmaydi — §12). Himoya: robot faqat paroli shu kompyuterda saqlangan firmalar uchun
      ishlaydi; qoralamalarni buxgalter imzolashdan oldin ko'radi. Xavfsizlik ko'rigi M1 topilmasi.
14. **Didox'ning partner tokeni yoki boshqa maxfiy kaliti ilova kodiga olinmaydi.** Ilova Didox API'sini to'g'ridan-to'g'ri
    chaqirmaydi; faqat buxgalter kirgan **sahifa (DOM)** bilan ishlaydi — xuddi buxgalter o'zi bosganidek. Sahifa Didox
    tokenini o'zi ishlatadi.
15. Harakat **inson tezligida** (ketma-ket, parallel ommaviy so'rovsiz). Didox sahifasi kutilganidan farq qilsa —
    to'xtash va buxgalterga xabar, "taxmin bilan davom etish" yo'q. Login xatosida avtomatik qayta urinish yo'q.
16. **Ma'lumot bitta umumiy serverda** (VPS, https) — barcha buxgalterlar bitta bazani ko'radi (M13, Sir 2026-10-15; avval —
    har kompyuterda lokal baza, M13 qurilguncha amalda shu). E-IMZO, ERI kalitlari va parollari, Didox oynasi buxgalter
    kompyuterida qoladi; Didox'ga faqat buxgalter kompyuteri chiqadi, server Didox'ni bilmaydi. **Bitta ERI kaliti faqat
    bitta kompyuterda ishlatiladi** (Sir kafolati) — ikki robot bitta oyni bajarmasligi shunga va Didox'ning o'z ro'yxatiga tayanadi.

## Tech stack (qat'iy)
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind
- Infra: **server** — VPS (docker compose: postgres + api + caddy/https; mijoz to'laydi, biz sozlaymiz); **buxgalter
  kompyuterida** — Electron desktop (Windows): serverdagi web'ni ochadi + E-IMZO va Didox roboti, lokal baza yo'q
  (M13, Sir 2026-10-15; avvalgi "lokal o'rnatish, har buxgalterga alohida" — 2026-10-11 — o'rnini bosadi)
- Monorepo: `apps/api`, `apps/web`

## Kod uslubi / konvensiyalar
- TypeScript `strict`.
- Kod va identifikatorlar inglizcha; UI matnlari o'zbek (lotin).
- Git commit: inglizcha, Conventional Commits, `Co-Authored-By` trailer'siz.
- Secret'lar faqat `.env` da (repo'da `.env.example`).

## Definition of Done (har modul)
- Testlar yashil; type/lint toza
- `code-review` topilmalari yopilgan
- UI bo'lsa `design/` ga mos (hozircha — shadcn toza uslub)
- SRS talablari bajarilgan; TODO/taxmin yo'q
- `verify` bilan haqiqiy xulq tasdiqlangan
