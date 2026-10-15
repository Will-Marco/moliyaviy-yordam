# Windows'ga o'rnatish va sinash — qadam-baqadam

> Kim uchun: Windows kompyuteriga ilovani birinchi marta o'rnatayotgan odam uchun.
> Hozircha **dev rejimi** (manba koddan ishga tushirish) — gate shunday bajariladi. Qadoqlangan `.exe`
> (`pnpm pack:win`) gate o'tgandan keyin.
>
> Gate'da nimani tekshirish kerakligi: `docs/plans/M8d-windows-gate.md`.

## 1. Dasturlarni o'rnatish (bir marta)

Hammasi **oddiy foydalanuvchi** huquqi bilan bo'ladi; admin faqat o'rnatuvchilar uchun.

### 1.1 Git
https://git-scm.com/download/win → yuklab oling, "Next, Next, Install" (hamma narsa standart holatda qoladi).

### 1.2 Node.js
https://nodejs.org → **LTS** (22 yoki 24) → `.msi` → o'rnatish standart holatda.

### 1.3 Tekshirish
**PowerShell**'ni ochish: Start → `powershell` deb yozib Enter. Keyin:

```powershell
git --version
node -v
```

Ikkisi ham versiya chiqarishi kerak. "not recognized" chiqsa — PowerShell'ni **yopib qayta oching**
(o'rnatuvchi PATH'ni yangilaydi, ochiq oyna buni bilmaydi).

### 1.4 pnpm
Windows standart holatda PowerShell skriptlarini o'chirib qo'ygan, `npm` va `pnpm` esa shunday skript —
avval shu foydalanuvchi uchun ruxsat beriladi (admin kerak emas; so'rasa `Y`):

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
npm i -g pnpm@11
pnpm -v
```

Bu qadamsiz `npm` "npm.ps1 cannot be loaded because running scripts is disabled on this system" deb to'xtaydi.

### 1.5 E-IMZO
Firmaning kaliti o'rnatilgan va E-IMZO **ishlab turgan** bo'lishi kerak (soat yonida ikonkasi bor).
Tekshirish: brauzerda Didox'ga ERI bilan kirib ko'ring — kalit ro'yxatda ko'rinsa, hammasi joyida.

## 2. Loyihani olish va qurish

```powershell
cd $HOME
git clone https://github.com/Will-Marco/moliyaviy-yordam.git
cd moliyaviy-yordam
pnpm install
pnpm build
```

- `pnpm install` — 1–5 daqiqa. Internet kerak.
- `pnpm build` — uch qismni (api, web, desktop) quradi. Oxirida xato bo'lmasligi kerak.

Keyinchalik kodni yangilash:
```powershell
cd $HOME\moliyaviy-yordam
git pull
pnpm install
pnpm build
```

## 3. Ishga tushirish

```powershell
pnpm dev:desktop
```

Eng birinchi marta Electron'ning o'zi yuklanadi (~100 MB, 1–2 daqiqa, "Downloading Electron binary..."):
`pnpm install` uni yuklamaydi. Internet kerak; keyingi safar bu bo'lmaydi.

Birinchi ishga tushirishda **sozlash oynasi** chiqadi: login va parol o'ylab topib kiritasiz. Bu — **shu
kompyuterdagi** ilovaga kirish paroli (Didox yoki E-IMZO paroli emas). Parol shu kompyuterda shifrlangan
holda saqlanadi.

Keyin ilovaning asosiy oynasi ochiladi. **Bu kompyuterda baza bo'sh** — ma'lumot boshqa kompyuterda, shuning
uchun firmalar ro'yxati bo'sh bo'ladi. Bu normal.

Ilovani to'xtatish: PowerShell oynasida `Ctrl+C`, yoki tray menyusidan "Chiqish".

## 4. Sinov ma'lumotini kiritish

Robot ishlashi uchun kamida bitta **tayyor faktura** kerak. Tartib:

1. **Firmalar** → yangi firma: **beruvchi** (qarz beradigan) firma.
   ⚠️ STIR **E-IMZO kalitidagi STIR bilan bir xil** bo'lishi shart — ilova kalitni STIR bo'yicha topadi.
   Boshqa STIR bo'lsa, firma "kaliti yo'q" deb o'tkazib yuboriladi.
2. **Firmalar** → yana bitta: **qarz oluvchi** firma.
3. **Shartnomalar** → yangi: beruvchi + oluvchi, raqam (masalan `12/25`), imzo sanasi **01.09.2026**,
   stavka **16%**.
4. Shartnoma ichida → **Operatsiya qo'shish** → "asosiy qarz berildi", sana **01.09.2026**, summa
   **100 000 000**.
5. **Fakturalar** sahifasi → oy **2026-09** → bitta faktura `tayyor` holatda ko'rinishi kerak.

## 5. Didox robotini sinash

### 5.1 Birinchi urinish — oyna ko'rinadigan holatda

Nima bo'layotganini ko'rish uchun:

```powershell
$env:DIDOX_SHOW_WINDOW="1"
pnpm dev:desktop
```

**Fakturalar** → **"Didox'da qoralama yaratish"** → firmani tanlash → tasdiqlash.

Shundan keyin **klaviatura va sichqonchaga tegmaslik kerak** — ilova o'z oynasiga klaviatura orqali yozadi.

Bo'lishi kerak: E-IMZO parol oynasi chiqadi va parol **o'zi yoziladi** → Didox'ga kiradi → forma to'ldiriladi →
qoralama saqlanadi → ilovada faktura "qoralama" bo'lib belgilanadi.

⚠️ Didox'da sinov qoralamasi paydo bo'lsa — **darhol o'chirib tashlang**.

### 5.2 Ikkinchi urinish — oyna ko'rinmaydigan holatda

PowerShell oynasini **yopib qaytadan ochib** (env o'zgaruvchisi yo'qolishi uchun):

```powershell
cd $HOME\moliyaviy-yordam
pnpm dev:desktop
```

Bu safar Didox oynasi ko'rinmasligi kerak (E-IMZO parol oynasi baribir chiqadi — u E-IMZO'ning o'zi).
Natija birinchi urinish bilan bir xil bo'lishi kerak.

## 6. Nima xato bo'lsa, nima qilish

| Ko'rinishi | Ma'nosi / nima qilish |
|---|---|
| `git`/`node`/`pnpm` "not recognized" | PowerShell'ni yopib qayta ochish |
| "…ps1 cannot be loaded because running scripts is disabled" | 1.4 dagi `Set-ExecutionPolicy` qatorini bajarish |
| `pnpm install` yarmida uzildi | internetni tekshirib, qaytadan `pnpm install` |
| "E-IMZO ishga tushirilmagan" | E-IMZO'ni ochish (tray'da turishi kerak) |
| "parol oynasi allaqachon ochiq" | ochiq E-IMZO parol oynasini yopish; qaytarilsa — bu kod muammosi, menga ayting |
| E-IMZO oynasi chiqdi, lekin parol yozilmadi | **menga ayting** — Windows begona oynaga fokus berishni cheklaydi |
| Didox sahifasi o'zgargan degan xato | ilova to'xtaydi va screenshot saqlaydi — "Diagnostika" dan oching, menga yuboring |

**Diagnostika fayllari qayerda:** ilovada tegishli tugma bor; qo'lda —
`%APPDATA%\moliyaviy-yordam\didox-diagnostics`. PowerShell'da ochish:
```powershell
explorer "$env:APPDATA\moliyaviy-yordam"
```

## 7. Ilovani to'liq o'chirish (kerak bo'lsa)

Dev rejimida "o'rnatma" yo'q — papkani o'chirish yetarli. Ma'lumot va parollar alohida joyda:

```powershell
# ma'lumot bazasi, ERI parollari, jurnal — hammasi shu papkada
explorer "$env:APPDATA\moliyaviy-yordam"
```

⚠️ Bu papkani o'chirish **bazani ham** o'chiradi.
