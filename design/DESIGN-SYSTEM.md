# Design system — Moliyaviy yordam

> Manba: `ui-ux-pro-max` tavsiyasi ("Data-Dense Dashboard", fintech/admin), 2026-10-07.
> Kod: `apps/web/src/index.css` (tokenlar), shadcn/ui (`radix-nova`).

## Uslub
- **Data-dense admin panel:** jadvallar markazda, ortiqcha bezak yo'q, tinch va professional.
- Faqat **light** tema (buxgalterlar ofisda, kunduzi ishlaydi). Dark tokenlar shadcn default'ida qoladi, UI'da almashtirgich yo'q.

## Rang (semantic tokenlar — komponentda hex yozilmaydi)
| Token | Qiymat | Ishlatilishi |
|---|---|---|
| `primary` | blue-800 `#1E40AF` | asosiy tugma, focus ring, faol nav |
| `foreground` | slate-900 | asosiy matn |
| `muted-foreground` | slate-600 | ikkilamchi matn (AA kontrast) |
| `background` | slate-50 | sahifa foni |
| `card` | oq | jadval/forma kartalari |
| `border` / `input` | slate-200 / slate-300 | chiziqlar, input chegarasi |
| `destructive` | qizil | xato, o'chirish |

## Tipografiya
- **Fira Sans** (400/500/600) — barcha matn; lotin-ext (oʻ, gʻ) va kirill qo'llab-quvvatlanadi.
- **Fira Code** (`font-mono`) — kodlar: STIR, hisob raqami, MFO, QQS kodi.
- Pul va raqam ustunlari: `tabular-nums`, o'ngga tekislangan. Format: `552 328,77`.
- Shkala: 12 / 14 / 16 / 20 / 24 px. Jadval matni 14px, sarlavha 20–24px.

## Qoidalar
- Har input'da ko'rinadigan label; xato input ostida, aria bilan bog'langan; submit xatosidan keyin birinchi xato maydonga focus.
- Tugma async paytida disabled + "…" holat.
- Bo'sh holat: tushuntirish + birinchi harakat tugmasi.
- Ikonalar faqat `lucide-react`, emoji yo'q.
- Har ekranda bitta primary harakat.
- Kenglik: kontent `max-w-6xl`; 375px'da ham gorizontal scroll yo'q (jadval o'z konteynerida scroll qiladi).
