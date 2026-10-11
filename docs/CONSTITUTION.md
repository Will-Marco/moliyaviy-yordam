# CONSTITUTION — Moliyaviy yordam: foiz hisobi

> O'zgarmas tamoyillar. Har o'zgarish shularga bo'ysunadi. Jarvis bularni hech qachon buzmaydi.
> O'zgartirish faqat Sir ruxsati bilan.

## Muhandislik tamoyillari
1. Doim eng **optimal, professional va clean** yo'l.
2. **Halollik:** taxmin yo'q; tekshirilmagan narsa "tayyor" emas.
3. **TDD** — test-first (red → green → refactor).
4. **Module-by-module** — har modul Sir tomonidan qabul qilinadi.
5. Qaytarib bo'lmas operatsiya (deploy/migrate/delete/secret) — faqat Sir ruxsati bilan.
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
> (uchinchi tomon kalitini o'zlashtirish). Yo'l B: buxgalter Didox saytiga **o'z brauzerida, odatdagidek ERI bilan**
> kiradi; ilova shu **ochiq, inson tomonidan kirilgan sessiyani** boshqaradi (forma to'ldirish / Excel yuklash → qoralama).
12. Ilova **hech qachon** hujjatni imzolamaydi va yubormaydi — faqat qoralama yaratadi (`tosign`/`sign` yo'q, "Юбориш" bosilmaydi).
13. ERI va uning paroli ilovaga **umuman tegmaydi**: kirishni buxgalter Didox'ning o'z sahifasida E-IMZO orqali qiladi.
    Ilova .pfx faylini, ERI yoki Didox parolini so'ramaydi, ko'rmaydi, saqlamaydi.
14. **Didox'ning partner tokeni yoki boshqa maxfiy kaliti ilova kodiga olinmaydi.** Ilova Didox API'sini to'g'ridan-to'g'ri
    chaqirmaydi; faqat buxgalter kirgan **sahifa (DOM)** bilan ishlaydi — xuddi buxgalter o'zi bosganidek. Sahifa Didox
    tokenini o'zi ishlatadi.
15. Harakat **inson tezligida** (ketma-ket, parallel ommaviy so'rovsiz). Didox sahifasi kutilganidan farq qilsa —
    to'xtash va buxgalterga xabar, "taxmin bilan davom etish" yo'q. Login xatosida avtomatik qayta urinish yo'q.
16. Ilova buxgalter kompyuterida lokal ishlaydi; Didox sessiyasi kompyuterdan faqat Didox'ga chiqadi.

## Tech stack (qat'iy)
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind
- Infra: lokal o'rnatish (Windows, har buxgalterga alohida) — qadoqlash usuli M9 rejasida tanlanadi (2026-10-11)
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
