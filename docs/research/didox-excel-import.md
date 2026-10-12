# Didox "Excel юклаш" — faktura importi (B1 tadqiqoti)

> 2026-10-12, Sir'ning Didox sessiyasida faqat o'qib o'rganildi (hech narsa yuklanmadi). Maqsad: ilova beruvchi firma × oy
> uchun `tayyor` fakturalarni Didox import shabloni formatida Excel qiladi → buxgalter Didox'da **o'zi** yuklaydi.
> Login va imzo to'liq buxgalter qo'lida (CONSTITUTION §12–13 bilan ziddiyat yo'q).

## Qayerda
- Didox → Ҳужжатлар → **Excel юклаш** (`/documents/new/upload-xls`). Kartochkalar: "Ҳисоб-фактуралар (тезлаштирилган юклаш)",
  "Ҳисоб-фактуралар", ТТЮ, Гибрид, Эркин шаклдаги. Har birida "Шаблон", "Йўриқнома", "Юклаш"; alohida "Excel юклаш тарихи" tabi.
- Ikkala faktura kartochkasi **bitta shablon** va bitta yo'riqnomadan foydalanadi (Google Drive):
  - Shablon: "Шаблон Excel для загрузки СФ (4).xlsx" — `docs.google.com/spreadsheets/d/1p5f0GU2pE2TEMqEaGITytaj7vZz3Oeks`
  - Yo'riqnoma: "Инструкция по заполнению Шаблона Excel" — `docs.google.com/document/d/14rf6lc7KZf8mmrLXxtS9RI3KBjuquBx103i1ehV3qQ8`

## Shablon tuzilishi (bitta varaq `sheet1`)
- 1–5 qatorlar bo'sh, **6–8 sarlavha** (birlashtirilgan), **9 — ustun raqamlari 1…72**, **10-qatordan ma'lumot**.
- Rang: **qizil — majburiy**, sariq — ixtiyoriy, yashil — maxsus. Yo'riqnoma: barcha maydonlar matn formatida bo'lgani
  ma'qul; ID/kod/STIR ustunlarida bo'shliq va ortiqcha belgi bo'lmasin; sanalar matn sifatida (`dd.mm.yyyy`).
- Bitta fakturada bir nechta qator bo'lsa: 1-ustun (п.п.) faqat birinchi qatorda, 41-ustun — qator raqami.

| Ustun | Majburiy | Ma'no | Biz yozadigan qiymat |
|---|---|---|---|
| 1 (A) | R | Faktura tartib raqami (п.п.) | 1, 2, 3… |
| 2 (B) | R | Faktura turi: 0 — Стандарт, 2 — Возмещение расходов, 3 — Без оплаты | `0` |
| 3 (C) | Y | Bir tomonlama faktura turi | bo'sh |
| 4 (D) | **R** | **Faktura №** | ⚠️ ochiq savol (Sir) |
| 5 (E) | **R** | **Faktura sanasi** | ⚠️ ochiq savol (Sir) |
| 6 (F) | R | Shartnoma № | `contract.number` |
| 7 (G) | R | Shartnoma sanasi | `signedOn` → `dd.mm.yyyy` |
| 8–11 | Y | Ishonchnoma | bo'sh |
| 12 | G | Товар отпустил (STIR/JShShIR) | bo'sh |
| 13–26 | — | **Исполнитель** (sotuvchi): faqat **14 — STIR majburiy**, qolganini Didox soliq bazasidan o'zi to'ldiradi | 14 = beruvchi STIR |
| 27–40 | — | **Заказчик** (xaridor): faqat **28 — STIR** yetarli | 28 = oluvchi STIR |
| 41 (AO) | R | Qator raqami fakturada | `1` |
| 42–44 | Y | Komitent | bo'sh |
| 45 | R | Mahsulot/xizmat nomi | `lineName` (§9.1 shablon) |
| 46 | R | MXIK (ИКПУ) | `10401999001000000` |
| 47–48 | — | Shtrix-kod, seriya | bo'sh |
| 49 | R | O'lchov birligi **kodi** (MXIK'ka bog'liq) | `1504942` — "xizmat (so'm)" (Didox formasida ko'rilgan) |
| 50–51 | Y | Asosiy narx, qo'shimcha % | bo'sh |
| 52 | Y | Soni | `1` |
| 53 | R | Narx | summa |
| 54–55 | Y | Aksiz | bo'sh |
| 56 | R | Yetkazib berish narxi | summa |
| 57 | R | ҚҚС stavkasi: **"Без НДС"** matni (0% → `0`, 12% → `12`) | `Без НДС` |
| 58 | R | ҚҚС summasi | `0` |
| 59 | R | ҚҚС bilan narx | summa |
| 60 (BH) | Y | Imtiyoz kodi | `102898` (formada MXIK tanlanganda Didox o'zi qo'ygan) |
| 61–64 | Y | Markirovka, ombor | bo'sh |
| 65 (BM) | R | Kelib chiqish turi: 1 — o'zi ishlab chiqargan, 2 — olди-sotdi, **3 — xizmat ko'rsatish**, 4 — ishtirok etmaydi | `3` |
| 66–72 | Y | Shartnoma ID, davr, lot, TTN, kiruvchi HF ID, FARM | bo'sh |

Namunadagi summalar vergul bilan (`1,00`, `0,12`) — yuklashda nuqta yoki vergul qabul qilinishi **tekshirilmagan**.

## Ochiq savollar
1. **Faktura № va sanasi shablonda majburiy (qizil).** Formada ularsiz qoralama saqlangan edi (didox-flow §2a), import esa
   talab qiladi. Variantlar: (a) ilova buxgalter bergan boshlang'ich raqamdan ketma-ket raqam + sana (masalan oy oxirgi kuni)
   qo'yadi, buxgalter Didox'da tuzatadi; (b) vaqtinchalik raqam (masalan `M-2026-01-1`). — **Sir qarori**.
2. Import natijasi — **qoralama**mi yoki imzolashga tayyor hujjatmi? Yo'riqnomada "черновик" so'zi yo'q. Bitta sinov
   yuklash bilan aniqlanadi (Sir ruxsati).
3. Summalarda nuqta/vergul, sanalar matn formati, "тезлаштирилган" va oddiy yuklash farqi — sinov yuklashda.
4. O'lchov birligi kodi `1504942` formadagi ro'yxatdan; tasnif.soliq.uz bilan tasdiqlash mumkin.
