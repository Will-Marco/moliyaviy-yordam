# Didox oqimi — xaritalash (yo'l B, brauzerni boshqarish)

> 2026-10-12, Sir bilan birga real Didox'da (uning Chrome'i orqali, faqat o'qib) xaritalanmoqda.
> Maqsad: "Счет-фактура без акта" (doctype 002, "Стандарт") **qoralamasini** ERI bilan kirib yaratish oqimini
> aniqlash — maydonlar, tugmalar, xulq. Imzolash yo'q (buxgalter Didox'da o'zi).

## 1. Login (ERI)
- Hujjat yaratishga o'tish: `https://didox.uz/documents/new` → kirilmagan bo'lsa
  `https://didox.uz/login_with_signature?r=/documents/new&isInternal=true` ga yo'naltiradi.
- Kirish turlari: **Калит орқали** (ERI, `/login_with_signature`), Парол орқali (`/login`), USB Токен (`/login_usb`).
- ERI: E-IMZO faol bo'lsa, kalit(lar) ro'yxatda chiqadi; **qidiriladigan ro'yxat** ("Поиск...") — ko'p kalitdan tanlash.
  Kalit kartasi: firma nomi + STIR + amal muddati (masalan "<FIRMA> MCHJ / <STIR 9 raqam> / до DD.MM.YYYY").
  **Кириш** tugmasi → E-IMZO **o'z oynasida** parol so'raydi (ilova ko'rmaydi).
- **Firma modeli (Sir, 2026-10-12): har firma — alohida ERI kaliti.** Firma tanlash = login'da kalit tanlash.
  Avtomatlashtirish har firma uchun alohida kiradi (kerakli kalit → E-IMZO parol → o'sha firma qoralamalari).
  ⚠️ Demak oy 1-kuni to'liq avtonom emas: har firma uchun buxgalter E-IMZO parolini kiritadi.
- **Kalitni ilova tanlaydi (Sir, 2026-10-12).** Buxgalter ilovada firmani tanlaydi → ilova Didox login sahifasida
  shu firmaning kalitini **STIR bo'yicha** topib bosadi va "Кириш"ni bosadi → buxgalter faqat E-IMZO parolini kiritadi →
  ilova o'sha firma qoralamalarini yaratadi. Buxgalter Didox'dagi kalit ro'yxatini qo'lda varaqlamaydi.
  - Moslash: kalit kartasidagi STIR = ilovadagi firma STIR. Muddati o'tgan kalitlar o'tkazib yuboriladi.
  - Ochiq: bitta STIR uchun bir nechta amaldagi kalit (masalan, direktor + buxgalter) bo'lsa qaysi biri —
    taklif: muddati eng uzog'i, yoki buxgalterdan bir marta so'rab eslab qolish.
  - Ochiq: kalit topilmasa (E-IMZO'da yo'q / muddati o'tgan) — ilova aniq xabar beradi, kirishga urinmaydi.
- **Kalit ro'yxati DOM'i** (2026-10-12, o'qildi): "Калитингизни танланг" bosilsa qidiruv maydoni ("Поиск...") va menyu
  `.certs-select__menu` ochiladi; har kalit — `.certs-select__item` ichida `.certs-select__item--name` (firma nomi),
  `.certs-select__inn` (STIR, faqat raqam), `.certs-select__expire` ("до DD.MM.YYYY"). E-IMZO bilan bog'lanish
  Didox bundle'ida (`index_*.js`) — global `EIMZOClient`/`CAPIWS` yo'q. Ilova uchun reja: menyuni ochish →
  `.certs-select__inn` matni = firma STIR bo'lgan elementni bosish → "Кириш".
  ⚠️ Class nomlari Didox build'iga bog'liq — buzilsa ilova to'xtab aniq xabar berishi kerak.

## 1a. Kalitlar ro'yxati — to'g'ridan-to'g'ri E-IMZO'dan (Sir, 2026-10-12)
- **Tekshirildi (Sir Mac'i, E-IMZO v6.4.7 Standard):** Node 24 o'zining `WebSocket`i bilan
  `ws://127.0.0.1:64646/service/cryptapi` va `wss://127.0.0.1:64443/service/cryptapi` (TLS tekshiruvisiz) ga ulandi;
  `{name:"version"}` va `{plugin:"pfx",name:"list_all_certificates"}` **API-KEY yubormasdan, Origin'siz** javob berdi.
  → Electron main jarayoni E-IMZO'dan kalit ro'yxatini o'zi oladi (e-imzo.md TL;DR 3 dagi noaniqlik o'qish chaqiruvlari uchun yopildi;
  `load_key`/`create_pkcs7` uchun tekshirilmagan — ilovaga kerak ham emas).
- Har kalit: `{disk, path, name, alias}`. `disk` — `.pfx` turgan papka, `name` — fayl nomi (kengaytmasiz).
  `alias` — vergul bilan ajratilgan X.500 maydonlari (kichik harfda):
  `o` (tashkilot nomi), **`1.2.860.3.16.1.1` (STIR)**, `1.2.860.3.16.1.2` (JShShIR — shaxsiy), `t` (lavozim, masalan direktor),
  `cn`/`name`/`surname` (egasi — shaxsiy), `serialnumber`, `validfrom`/`validto` (`YYYY.MM.DD HH:mm:ss`), `l`, `st`, `c`.
- **Ilova uchun oqim:**
  1. Ilova E-IMZO'dan ro'yxatni oladi → STIR bo'yicha o'z firmalariga bog'laydi; ekranda har firma yonida "kalit bor / yo'q /
     muddati o'tgan (validto)" ko'rinadi. Buxgalter faqat kaliti bor firmani tanlay oladi.
  2. Didox oynasida (didox.uz, Didox o'zi E-IMZO bilan gaplashadi) ilova kalit menyusidan `.certs-select__inn` = STIR
     (bir nechta bo'lsa `.certs-select__expire` = tanlangan kalitning `validto`) elementni bosib "Кириш"ni bosadi.
  3. E-IMZO parolni o'z oynasida so'raydi — buxgalter kiritadi. Ilova parolni ko'rmaydi.
- Shaxsiy maydonlar (JShShIR, F.I.Sh.) ilovada saqlanmaydi va log'ga yozilmaydi — faqat STIR, `o`, `t`, `validto`.
- Ochiq: E-IMZO ishlamayotgan bo'lsa (ulanish rad) — ilova "E-IMZO'ni ishga tushiring" deydi.

## 1b. E-IMZO parolini avtomatik yozish — spike YASHIL (macOS, 2026-10-12)
- AppleScript (System Events): `E-IMZO` jarayonida oyna paydo bo'lishini kutadi → parolni macOS Keychain'dan
  (`security find-generic-password -s moliyaviy-yordam-eri -a <STIR> -w`) o'qiydi → `frontmost` → `keystroke` → Return.
- Natija (Sir): Didox'da "Кириш" bosilgach E-IMZO parol oynasi chiqdi, **parolni skript o'zi yozdi**, Didox'ga kirildi.
  Parol skriptdan, log'dan va chatdan o'tmadi. Skriptni Sir o'z terminalida ishga tushirdi (Accessibility ruxsati bilan).
- macOS jarayon nomi: `/Applications/E-IMZO.app/Contents/MacOS/E-IMZO` → System Events'da `process "E-IMZO"`.
- Eslatma: `keystroke` joriy klaviatura tartibiga bog'liq (ABC kerak). Windows'da `SendInput` + `KEYEVENTF_UNICODE` —
  tartibga bog'liq emas. Oyna elementlari tuzilishi (terminal log'i) olinmadi — Windows spike'ida qayta o'rganiladi.
- Production'da parol manbai — Electron `safeStorage` (CONSTITUTION §13), Keychain faqat spike uchun.

## 2. Hujjat yaratish formasi (o'qildi 2026-10-12, hech narsa saqlanmadi)
- Login'dan keyin `/documents/new?tab=all…` — hujjatlar ro'yxati; tablar: Кирувчи, Чиқувчи, **Қоралама**, Шаблонлар,
  **Excel юклаш** (muqobil yo'l — keyin ko'riladi). **"Яратиш"** → `/create_document`.
- Ochilganda **"Диққат!" modal** (ҚҚС guvohnomasi haqida ogohlantirish) → **"Ёпиш"** bilan yopiladi — har safar.
- Tur tanlash: ikki `select.doc-types__select` — 1) "Ҳисоб-фактура актсиз" (sukut), 2) "Стандарт" (sukut). Bizga aynan shu.
- **Sarlavha maydonlari** (`input.input__input`, `name`/`id` yo'q — label matni bo'yicha topiladi):
  `*Ҳисоб-фактура рақами`, `*Шартнома рақами`, `*Ҳужжат санаси` (date), `*Шартнома санаси` (date), `Шартнома ID`, `ТТЮ ИД`.
  ⚠️ Faktura raqami/sanasi formada **majburiy** (`*`), SRS §9.1 esa ularni buxgalter qo'yadi deydi → qoralamani ularsiz
  saqlash mumkinmi — **sinov saqlash bilan tekshiriladi** (ochiq savol 1).
- **Sizning маълумотларингиз** (sotuvchi = kirgan firma): STIR `disabled` va **avtomatik to'ldirilgan**; nom, ҚҚС reg. raqami,
  hisob raqami (select+input), MFO, bank, manzil, direktor, bosh hisobchi — hammasi Didox profilidan to'ldiriladi.
  Checkbox'lar: Воситачи, ҚҚС имтиёзи, Акциз (o'chiq).
- **Контрагент**: `*СТИР/ЖШШИР` (bo'sh) → kiritilsa nom/manzil/direktor Didox'dan to'ldirilishi kutiladi (**tekshirilmagan**,
  ochiq savol 2). Филиал (MUI autocomplete), "бир томонлама ҳужжат", "Лот мавжуд" checkbox'lari.
- "Товар қўйиб юборган" (STIR, ФИШ) — ixtiyoriy, bo'sh qoladi.
- **Tovar/xizmat jadvali** (`main table`, 1 qator sukut; qator inputlari tartibda):
  `*МХИК ва номи` (MUI autocomplete) · `*изоҳ` · штрих код · `*ўлчов бирлиги` (MUI) · `*Сони` · `*Нарҳ` ·
  `*етказиб бериш нарҳи` · `ққс, %` (MUI select: **ҚҚСсиз**, 0%, 6%, 12%, 15% — **sukut 12%!**) · `*ққс миқдор` · `*Жами` ·
  Омбор (MUI) · `*Товарни келиб чиқиши` (MUI, sukut "Олди-сотди"). Ustida: Тескари ҳисоб, Акциз, Товар маркировкаланган,
  **Қўлда ҳисоблаш** checkbox'lari. Bizning qator (SRS §9.1): MXIK 10401999001000000, Сони 1, Нарҳ = oy foizi, **ҚҚСсиз**.
- Ишончнома bloki — bo'sh qoladi.
- **Tugmalar:** "Ҳужжатни кўрсатиш", **"Сақлаб қолиш"** (qoralama — bizniki), ⛔ **"Имзолаш"** (ilova hech qachon bosmaydi, §12),
  "Бекор қилиш".
- Texnik: React + MUI; inputlarda `name`/`id` yo'q → selector = label matni + tartib. React controlled input — qiymat
  `nativeInputValueSetter` + `input` event bilan yoki haqiqiy klaviatura bilan beriladi (spike'da tanlanadi).

## 2a. Sinov qoralamasi (2026-10-12, Sir ruxsati bilan; yaratildi → o'chirildi)
Firma A (Sir kaliti) → firma B (Sir ro'yxatidagi guruh firmasi; haqiqiy nom/STIR repo'ga yozilmaydi), shartnoma `TEST-1` 12.10.2026,
summa 1.00, izoh "SINOV - o'chiriladi". "Имзолаш"ga tegilmadi.
- **"Диққат!" modal** faqat sessiyadagi birinchi `/create_document` da chiqdi — ikkinchi ochishda yo'q (ilova ikkala holatni ko'taradi).
- Kirgandan keyin toast: "Ушбу корхона учун филиал танлаш имконияти мавжуд" — e'tiborsiz.
- **Sana maydoni** — niqobli matn (`__.__.____`) + kalendar; raqamlarni ketma-ket yozish (`12102026`) ishladi.
  Kalendarda kelajak sanalar yopiq.
- **Kontragent STIR** yozilgach ~1–2 s ichida nom, QQS reg. raqami, hisob raqami, MFO, bank, manzil, direktor, bosh hisobchi va
  QQS statusi **avtomatik to'ldi** → ilova kontragent rekvizitlarini yozmaydi, faqat STIR.
- **MXIK**: kodni yozish → autocomplete'da bitta variant → bosilganda:
  ўлчов бирлиги o'zi **"xizmat (so'm)"** (yagona variant), **ққс o'zi "ҚҚСсиз"**, yangi **"Имтиёз"** ustuni paydo bo'lib
  **102898** (SK 244-m. 1-band 10-xatboshi) qo'yildi. Ya'ni "12% → Без НДС" qadamini MXIK o'zi bajaradi — ilova baribir
  tekshiradi (kutilmagan qiymat → to'xtash).
- Сони 1 + Нарҳ → "етказиб бериш нарҳи" va "Жами" avtomatik.
- "Товарни келиб чиқиши" sukut **"Олди-сотди"** qoldi — SRS §9.1/§9.2 bo'yicha **"Хизмат кўрсатиш"** ga o'zgartirish kerak
  (sinovda o'tkazib yuborildi).
- **"Сақлаб қолиш" — faktura raqami va sanasi BO'SH holda saqlandi** (validatsiya xatosi yo'q) → SRS FR-8.6 tasdiqlandi.
  Saqlangach `/documents/new/draft` ro'yxatiga o'tadi, **lekin ro'yxat bo'sh qoldi — qayta yuklash kerak bo'ldi**.
- **Qoralama ID**: UUIDv1 hex (32 belgi, defissiz), havola `/documents/{ID}/1`; ID ichidagi vaqt yaratilish vaqtini beradi.
  Saqlash javobi ID'ni ko'rsatmaydi → ilova ID'ni Қоралама ro'yxatidan oladi (kontragent STIR + shartnoma № + summa bo'yicha,
  eng yangisi). Qoralamada **Rouming ID** ham bor (soliq tizimiga qoralama bosqichida yetadi).
- `/documents/{ID}/1` ni **to'g'ridan-to'g'ri URL** bilan ochish bo'sh "Хато" berdi; ro'yxatdan bosib ochish ishladi.
- Qoralama sahifasi tugmalari: Ўзгартириш, **Нусха олиш**, ⛔ Имзолаш, Ўчириш. O'chirish — custom modal "Амални тасдиқланг"
  → "Ўчириш" → holat **"ҚОРАЛАМА ЎЧИРИЛДИ"** (yumshoq o'chirish, hujjat ko'rinib turadi).
- Chrome kengaytmasining tarmoq kuzatuvi Didox XHR'larini ko'rsatmadi — API so'rovlari xaritalanmadi (B yo'lida kerak emas).

## 3. Ochiq savollar
1. ~~Raqam/sanasiz saqlash~~ — ha (§2a). 2. ~~Kontragent avto-to'ldirish~~ — ha. 3. ~~Ўлчов бирлиги~~ — "xizmat (so'm)".
4. ~~Qoralama ID~~ — Қоралама ro'yxatidan (§2a).
5. "Excel юклаш" — ko'p qoralamani bir yo'la yuklash formadan ishonchliroqmi?
6. ~~E-IMZO avtomatik parol spike~~ — **ishladi** (§1b).
7. "Товарни келиб чиқиши" ro'yxatida "Хизмат кўрсатиш" varianti matni aniq qanday (keyingi sinovda).
8. "Нусха олиш" — o'tgan oy qoralamasidan nusxa olib faqat narx/izohni o'zgartirish formadan soddaroqmi?
