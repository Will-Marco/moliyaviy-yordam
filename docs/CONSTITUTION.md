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
7. Pul va stavka **hech qachon `float`/`number`** bilan hisoblanmaydi — DB'da `Decimal`, kodda decimal kutubxona.
8. Hisoblash qoidalari faqat `SRS.md §4` (CR-1…CR-9) dan olinadi. Qoida o'zgarsa — avval SRS, keyin test, keyin kod.
9. Foiz yadrosi — **sof funksiya**, DB/HTTP/vaqtga bog'liq emas ("bugun" parametr sifatida beriladi).
10. Har CR qoidasi kamida bitta test bilan qoplanadi; SRS'dagi etalon misol (yanvar = 552 328,77) doim yashil.
11. Ekran, Excel va faktura **bitta** yadro natijasidan oladi — raqam ikki joyda alohida hisoblanmaydi.

## Didox (qat'iy chegaralar)
12. Ilova **hech qachon** hujjatni imzolamaydi va yubormaydi — faqat qoralama yaratadi (`tosign`/`sign` chaqirilmaydi).
13. ERI kaliti (.pfx) va uning paroli hech qachon so'ralmaydi, saqlanmaydi. Didox akkaunt paroli — faqat
    shifrlangan, log'ga va UI'ga chiqmaydi.
14. Faqat rasmiy partner API (`api-docs.didox.uz`). Cookie / web-sessiya / hujjatlashtirilmagan ichki API — taqiqlangan.
15. Didox login xatosida avtomatik qayta urinish yo'q (25 urinish → akkaunt doimiy bloklanadi).

## Tech stack (qat'iy)
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind
- Infra: Docker Compose
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
