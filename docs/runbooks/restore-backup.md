# Zaxiradan tiklash (qo'lda)

> Ilova har kuni lokal bazadan nusxa oladi (M9, Sir 2026-10-12): oxirgi 14 kun + har oydan bittasi (1 yil).
> Tiklash hozircha **qo'lda** — bu yo'riqnoma bo'yicha. Joriy baza hech qachon o'chirilmaydi, yoniga ko'chiriladi.

## Zaxiralar qayerda
Ilovada: sarlavhadagi **Zaxira → Zaxira papkasini ochish**. Ilova ma'lumotlari papkasi (`<ilova papkasi>`):

| Tizim | Papka |
|---|---|
| Windows | `%APPDATA%\Moliyaviy yordam` |
| macOS | `~/Library/Application Support/Moliyaviy yordam` |

(Dev ishga tushirish ham shu papkani ishlatadi — `apps/desktop/package.json` `productName`.)

Ichida: `db/` — baza, `backups/` — nusxalar:
- `daily-YYYY-MM-DD.tgz` — kunlik nusxa (sana — Toshkent vaqti bo'yicha, o'sha kunning birinchi ishga tushishida olingan);
- `before-migrate-….tgz` — yangilanishdan (migratsiyadan) oldingi nusxa; avtomatik o'chirilmaydi.

## Tiklash
1. Qaysi kunga qaytish kerakligini aniqlang va mos `daily-…tgz` faylni tanlang (shu kungacha kiritilganlar qaytadi,
   undan keyingilari **qayta kiritiladi**).
2. **Ilovani to'liq yoping** (tray'dan ham). Ilova ochiq bo'lsa tiklamang.
3. Repo bor kompyuterda (Node 24) buyruq:

```bash
node apps/api/scripts/restore-backup.mjs "<ilova papkasi>/backups/daily-2026-10-12.tgz" "<ilova papkasi>"
```

   Skript joriy `db/` ni `db-before-restore-<vaqt>/` ga ko'chiradi, nusxani yangi `db/` ga tiklaydi va firmalar sonini
   chiqaradi.
4. Ilovani oching, ma'lumotlarni tekshiring. Hammasi joyida bo'lsa, bir necha kundan keyin `db-before-restore-…`
   papkasini o'chirish mumkin. Xato tanlangan bo'lsa — ilovani yoping, `db/` ni o'chirib, `db-before-restore-…` ni
   yana `db/` deb nomlang.

## Cheklovlar
- Nusxalar baza bilan **bir diskda** (Sir qarori: faqat lokal) — disk buzilishi yoki kompyuter yo'qolishidan himoya qilmaydi.
- O'rnatilgan ilova ichida tiklash skripti yo'q: buxgalter kompyuterida tiklash uchun repo va Node kerak (yoki nusxani
  repo bor kompyuterga ko'chirib, tiklangan `db/` ni qaytarish).
- Tekshirildi (2026-10-12): nusxa → keyingi o'zgarish → tiklash → ilova bazani ochadi, keyingi o'zgarish yo'q,
  migratsiya qayta ishlamaydi.
