# Windows gate — Didox roboti Windows'da (M8d)

> Maqsad: ilova **Windows'da** ishga tushsin, Didox'ga o'zi kirsin (E-IMZO paroliga PowerShell yozadi) va
> qoralama yaratsin. macOS'da bularning hammasi o'tgan (c1, c2, M8d gate'lari); Windows kodi yozilgan, lekin
> **hali hech qachon ishlatilmagan**. Sir: "asosiysi — Windows'da ishlashi".
>
> Holat: tayyorgarlik tugadi (2026-10-14), gate Sir tomonidan bajariladi.

## 0. Kerakli narsalar (Windows kompyuterida)

| Narsa | Izoh |
|---|---|
| Git | `git --version` |
| Node 22+ (24 tavsiya) | `node -v` |
| pnpm 11 | `npm i -g pnpm@11` → `pnpm -v` |
| E-IMZO | o'rnatilgan, **ishlab turgan** (tray'da), firmaning kaliti ko'rinadi |
| Internet | Didox + `pnpm install` uchun |

Buyruqlar **PowerShell**'da bajariladi. Env o'zgaruvchisi PowerShell'da boshqacha yoziladi:
`$env:NOM="1"` — `NOM=1 buyruq` emas.

## 1. W0 — E-IMZO oynasini o'lchash — ✅ BAJARILDI (2026-10-14)

O'lchov `apps\desktop\scripts\list-windows.ps1` bilan qilindi. Natija (to'liq yozuv:
`docs/research/e-imzo.md §9b`):

1. E-IMZO tray'da ishlab turganda uning **ko'rinadigan oynasi yo'q** — `javaw` ro'yxatda chiqmaydi.
2. Parol so'raganda `javaw` oynasi paydo bo'ladi, lekin u **asosiy oyna emas** (`MainWindowHandle = 0`).
3. Sarlavha — **hisoblagich**: `Отмена через 55 секунд`, har sekundda o'zgaradi.

Ya'ni kodda yozilgan uchta sarlavha bo'yicha izlash **hech qachon ishlamas edi** — ilova oynani topmasdan
"parol oynasi chiqmadi" deb to'xtar edi. Tuzatildi: oyna macOS'dagi mantiq bilan topiladi — E-IMZO'ning
ko'rinadigan oynasi bor-yo'qligi bo'yicha (`EnumWindows` + `IsWindowVisible` + oyna egasi E-IMZO jarayonimi).
Parol faqat E-IMZO'ning o'z oynasiga tushadi: egasi aniqlanmasa — hech narsa yozilmaydi.

## 2. W1 — qurish va ishga tushirish

```powershell
git clone <repo-url> moliyaviy-yordam
cd moliyaviy-yordam
pnpm install
pnpm build
pnpm dev:desktop
```

**O'tdi deyiladi, agar:**
- `pnpm install` va `pnpm build` xatosiz tugasa;
- ilova oynasi ochilsa va **sozlash oynasi** login/parol so'rasa (bu kompyuterda baza bo'sh — bu normal);
- parol kiritilgach ilova ichiga kirsa, menyular va sahifalar ko'rinsa.

**Yuboring:** xato bo'lsa — to'liq matni; bo'lmasa — "W1 o'tdi".

## 3. W2 — sinov ma'lumotini kiritish

Windows'dagi baza bo'sh (ma'lumot macOS'dagi kompyuterda). Robot ishlashi uchun kamida bitta tayyor faktura kerak:

1. **Beruvchi firma** — STIR **E-IMZO kalitidagi STIR bilan bir xil** bo'lishi shart (aks holda ilova kalitni
   topmaydi va firmani o'tkazib yuboradi).
2. **Qarz oluvchi firma** — bittasi.
3. **Shartnoma** — c1 gate'dagi kabi: 01.09.2026 imzolangan, 16%, 100 mln.
4. **Operatsiya** — asosiy qarz berildi (01.09.2026).

Shundan keyin **Fakturalar** sahifasida **2026-09** oyida bitta `tayyor` faktura ko'rinishi kerak.

**Yuboring:** "W2 o'tdi" yoki qaysi qadamda nima ko'rinmagani.

## 4. W3 — Didox roboti, oyna KO'RINADIGAN holatda

Birinchi Windows urinishi ko'rinadigan oyna bilan bo'ladi: nima sodir bo'layotgani ko'rinib turadi.

```powershell
$env:DIDOX_SHOW_WINDOW="1"
pnpm dev:desktop
```

Ilovada **Fakturalar → "Didox'da qoralama yaratish"** → firmani tanlang → tasdiqlang.

**Kuzatiladigan joylar (har biri alohida xabar bering):**
1. E-IMZO parol oynasi chiqdimi va **parol o'zi yozildimi**?
2. Didox oynasida login o'tdimi (kalit tanlandimi)?
3. Forma to'ldirildimi — ayniqsa **МХИК** maydoni (macOS'da eng nozik joy shu edi)?
4. Qoralama saqlandimi, ilovada belgilandimi?

**Kutilayotgan nozik joylar (chiqsa — bu kutilgan, tuzatamiz):**
- `not_focused` — Windows begona jarayonga fokus berishni cheklaydi (`SetForegroundWindow`), ya'ni parol oynasi
  o'zi oldinga chiqmasa typist yozmaydi. Bu **xavfsiz** xato: hech narsa yozilmaydi.
- `dialog_already_open` — W0 dagi sarlavha muammosi.
- Forma to'lmasligi — ko'rinmas/shaffof oynaga fokus berish Windows'da boshqacha ishlashi mumkin.

## 5. W4 — oyna KO'RINMAYDIGAN holatda

`$env:DIDOX_SHOW_WINDOW` ni olib tashlab (yoki yangi PowerShell oynasidan) yana bir marta:

```powershell
pnpm dev:desktop
```

Bu safar hech qanday Didox oynasi ko'rinmasligi kerak (E-IMZO parol oynasi baribir chiqadi — u E-IMZO'ning o'zi).
Natija W3 bilan **bir xil** bo'lishi kerak.

⚠️ Didox'da sinov qoralamasi yaratilsa — **darhol o'chirib tashlang**.

## 6. W5 — tray va jadval

```powershell
$env:DIDOX_SCHEDULE_CHECK_MS="15000"
pnpm dev:desktop
```

**Tekshiriladi:**
1. Tray (soat yonidagi) ikonkasi **ko'rinadimi**? (Windows uchun alohida oq+konturli ikonka yasaldi;
   macOS'ning qora ikonkasi Windows 11 ning qora panelida ko'rinmas edi.)
2. Chap bosish ilovani ochadimi, o'ng bosish menyu beradimi?
3. Oynani yopsangiz ilova tray'da **qolib** ishlaydimi?
4. Jadval o'zi ishga tushadimi (klaviaturaga 3 daqiqa tegmasa) yoki "kutmoqda" deb yozadimi?
5. **Bildirishnoma** chiqadimi? (macOS'da imzosiz ilovaga ruxsat bermadi. Windows'da dev rejimida ham
   chiqmasligi mumkin — toast uchun o'rnatilgan ilova kerak. Chiqmasa, bu `pack:win` dan keyin qayta tekshiriladi.)

## 7. Gate'dan oldin tuzatilgan narsalar (2026-10-14)

Windows'da **albatta** yiqitadigan uchta joy kod ko'rib chiqishda topildi va tuzatildi:

1. **PowerShell struct'ga yozish** — `$input.ki.wScan = …` PowerShell'da **nusxaga** yozadi va yo'qoladi, ya'ni
   `SendInput` belgisiz keystroke yuborar edi: parol E-IMZO'ga hech qachon kirmaydi, lekin ilova "yozdim" deb
   o'ylaydi. Endi nested struct alohida yasalib, butunlay o'zlashtiriladi (`powershell.ts`, test bilan yopildi).
2. **`-EncodedCommand`** — skript ichida C# va qo'shtirnoqlar bor; `-Command` bilan uzatilsa PowerShell xom
   buyruq satrini qayta pars qilib qo'shtirnoqlarni yo'qotishi mumkin edi. Endi skript base64 (UTF-16LE) bilan
   uzatiladi — pars qiladigan narsa qolmaydi (`win32.ts`).
3. **API child-process env'i** — ilova ichki serverni tozalangan env bilan ko'tarardi. Windows'da `SystemRoot`,
   `TEMP`, `APPDATA` bo'lmasa Node'ning crypto/DNS'i yuklanmaydi va PGlite vaqtinchalik fayl yozolmaydi; ya'ni
   ilova **umuman ishga tushmasligi** mumkin edi. Endi tizim env'i meros bo'lib o'tadi (`main.ts`).

Qo'shimcha: Windows uchun tray ikonkasi (`assets/trayWin.png`) va chap bosishda ochilish.

Testlar: desktop **496**, web 196, api 130 — yashil.

## 8. Ma'lum cheklov

`pnpm test:e2e` Windows'da ishlamaydi (`pretest:e2e` da `DOTENV_CONFIG_PATH=... buyruq` shakli — bu POSIX
qobiqlarining sintaksisi). Gate'ga kerak emas; kerak bo'lsa alohida tuzatiladi.
