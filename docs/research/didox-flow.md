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

> ⚠️ **Tuzatish (spike 2026-10-13, §2c):** "API-KEY va Origin'siz" qismi noto'g'ri. E-IMZO kalitlar ro'yxatini
> `Origin` sarlavhasisiz bermaydi (`-1022`); ilova `Origin: http://localhost` yuboradi (API-kalit baribir kerak emas).
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
- **Qoralama ro'yxati (`/documents/new/draft`, xaritalandi):** `?tab=all&page=1&limit=20&partner=<STIR>` — kontragent STIR
  bo'yicha **URL orqali filtr** ("СТИР бўйича қидириш" maydoni shuni qo'yadi). Jadval MUI; ustunlar: [1] xavf, [2] holat
  (`.doc-status--white` faol qoralama, `.doc-status--red` o'chirilgan — **o'chirilganlar ham "Барчаси"da qoladi**), [3] tur,
  [4] kontragent nom + STIR, [5] hujjat № va sana, [6] shartnoma № va sana, [7] ҚҚСсиз summa, [8] ҚҚС bilan, [9] ҚҚС. Har katak
  `<a href="/documents/{32hex}/1">`. "Яратилган" tabi (`tab=created`) bo'sh chiqdi — ishlatilmaydi.
- Chrome kengaytmasining tarmoq kuzatuvi Didox XHR'larini ko'rsatmadi — API so'rovlari xaritalanmadi (B yo'lida kerak emas).

## 2b. B4 spike — Electron oynasida real login (2026-10-12, YASHIL)
- Electron 34.5.8 (Chromium 132), alohida in-memory partition, `contextIsolation`+`sandbox`, preload yo'q. UA'da
  `Electron/34.5.8` bor — Didox bloklamadi.
- Sir kalitni tanladi, "Кириш" → E-IMZO oynasi → parolni **o'zi** kiritdi → `/documents/new`. Sertifikat xatosi yo'q
  (Didox sahifasi E-IMZO bilan o'zi gaplashdi), ruxsat so'rovi yo'q.
- **Kirilgan firma STIR'i:** sarlavhada `.company-inn > div` matni `303 471 702` ko'rinishida (bo'shliqlar bilan) →
  `verifyFirm` shu elementni o'qiydi, bo'shliqlarni olib solishtiradi.
- **Imzolash/yuborish endpoint'lari** (Didox bundle `index_*.js` matnidan, hech narsa bosilmadi): `documents/{id}/sign`,
  `documents/{id}/tosign`, `documents/{id}/send`, `documents/import/{id}/send`, `documents/offer/sign`,
  `documents/uzcard_offer/sign`; boshqa lokal imzolovchilar: `http://localhost:6210/crypto/sign`, `ws://127.0.0.1:44480/sign`.
  → Didox oynasi `webRequest` bilan shu yo'llarni **bloklaydi** (FR-8.9); lokal xostlardan faqat E-IMZO (64443/64646) ruxsat.
  E-IMZO'ni o'zi bloklanmaydi (login uchun kerak) — hujjat imzosi baribir yuqoridagi POST'siz bajarilmaydi.

## 2c. Spike S1–S7 (2026-10-13, Sir bilan, real Didox + E-IMZO; sinov qoralamasi yaratildi → o'chirildi)

Ilovaning o'z dvigatelida (Electron 44, `openDidoxWindow`/`locators`/`net-policy`) o'tkazildi; firma rekvizitlari bu yerga
yozilmaydi. **Didox login va hujjatlar sahifasi qayta dizayn qilingan** (`documents-page-v2`, MUI) — quyida farqlar.

### S1 — M8b login gate: **YASHIL**. Uchta drift topildi va tuzatildi
1. **E-IMZO endi Origin talab qiladi.** `version` hammaga javob beradi, lekin `pfx.list_all_certificates` Origin'siz
   `status:-1022` "Domen null uchun API-kalit yaroqsiz" qaytaradi. `Origin: http://localhost` bilan ro'yxat keladi —
   apikey handshake **kerak emas** (E-IMZO localhost'ga ishonadi). §1a dagi "API-KEY va Origin'siz ishladi" **noto'g'ri**.
2. **Yopiq kalit tanlagich — `.certs-trigger`** (ichida `.certs-trigger__name` + `.certs-trigger__inn`); kalitlar kelgach
   birinchisi oldindan tanlangan bo'ladi, kelmagunicha eski "Калитингизни танланг" matni turadi. **Ochiq menyu eski
   klasslarini saqlagan**: `.certs-select__menu`, `.certs-select__item`, `.certs-select__inn`, `.certs-select__expire`
   ("до DD.MM.YYYY") — `keyMenuItems`/`keyMenuItem` o'zgarmadi.
3. **Tugma matnlari `<span>` ichida** (`button.ui-button > span.ui-button__text`) — "eng chuqur element" qoidasi faqat
   **bir xil selektorga mos** avlodni hisobga olishi kerak, aks holda "Кириш" topilmaydi.

### S2 — forma (`/create_document`)
- **Yozish usuli:** faqat `char` hodisasi **yetarli emas** — niqobli sana maydoni `__.__.____` bo'lib qoladi, МХИК
  avtoto'ldirgichi bo'sh qolib katalogni filtrsiz ochadi. Har belgi uchun `keyDown + char + keyUp` kerak (`view.ts` tuzatildi).
- **Tozalash:** sintetik Cmd/Ctrl+A ishlamaydi; Chromium'ning `webContents.selectAll()` + Backspace ishlaydi (`clear()` tuzatildi).
- Sarlavha maydonlari (`input.input__input`, `name`/`id` yo'q, tartib bo'yicha): `0` *Ҳисоб-фактура рақами · `1` *Шартнома
  рақами · `2` *Ҳужжат санаси · `3` *Шартнома санаси · `4` Шартнома ID · `5` ТТЮ ИД · `6` o'z STIR (disabled) ·
  `11` *контрагент СТИР · `25` kontragent nomi · `30` manzil · `31` direktor.
- Sana niqobi raqamlarni o'zi formatlaydi: `01092026` → `01.09.2026` (`01.09.2026` ham qabul qilinadi).
  Shartnoma raqami `12/25` ni muammosiz oladi. Faktura raqami/sanasi bo'sh qoladi.
- Kontragent STIR yozilgach nom/ҚҚС reg./hisob raqami/MFO/bank/manzil/direktor avtomatik to'ladi; **STIR almashtirilsa
  hammasi yangilanadi — stale qiymat yo'q**.
- **Tovar jadvali ustunlari sarlavha matni bo'yicha topilishi shart:** МХИК tanlangach **"Имтиез" ustuni qo'shiladi** va
  undan keyingi indekslar siljiydi. Tartib: `№ · МХИК ва маҳсулот ёки хизмат номи* · Маҳсулот ёки хизматга изоҳ* ·
  Товар/хизмат штрих коди · ўлчов бирлиги.* · Сони* · Нарҳ* · етказиб бериш нарҳи* · ққс, % · ққс, Миқдор* · Жами* ·
  [Имтиез] · Омбор · Товарни келиб чиқиши*`.
- **МХИК:** to'liq kod yozilsa **aniq bitta variant** chiqadi; ro'yxat `document.getElementById(input.getAttribute('aria-controls'))`
  ichida (sahifada bir nechta avtoto'ldirgich bor — shu bog'lanish bo'yicha topiladi). Tanlangach: ўлчов бирлиги
  `xizmat (so’m)` (lotin, egri apostrof), ққс `ҚҚСсиз` (12% dan), Имтиез `102898 - (SK 244-m.) 1-band. 10.xatboshi…`.
- **Summa:** `Нарҳ` nuqta bilan yoziladi va **xuddi shunday** qaytariladi (`552328.77`, ming ajratgichsiz) →
  `DIDOX_DECIMAL_SEP = '.'` tasdiqlandi. `етказиб бериш нарҳи` va `Жами` avtomatik hisoblanadi (`552328.77`).
- ⚠️ **`ққс, Миқдор` ҚҚСсиз holatda BO'SH qoladi** (`0` emas). M8c spec §1 uni `0n` deb kutadi — forma tekshiruvi bo'sh
  qiymatni nol deb qabul qilishi kerak, aks holda **har faktura** `FORM_UNEXPECTED_VALUE` bilan to'xtaydi.
- Bu sessiyada "Диққат!" modali **umuman chiqmadi** (ilova ikkala holatni ko'taradi).

### S2a — МХИК avtoto'ldirgichi belgilarni yo'qotadi (qo'shimcha, 2026-10-13)
Har belgi server qidiruvini va qayta render'ni qo'zg'atadi; 60–80 ms/belgi tezlikda kod **chala** tushadi va ro'yxat
filtrlanmay qoladi (767 → 158 variant). Birinchi variantni ko'r-ko'rona bosish **noto'g'ri mahsulot** tanlaydi: ҚҚС 12%
bo'lib qoladi, Имтиёз ustuni chiqmaydi, `Жами` 618 608.22 bo'ladi (552 328.77 o'rniga). Shuning uchun 6-qadam: yozgandan
keyin **input qiymati kod bilan aynan tengligi tekshiriladi**, teng bo'lmasa `clear` + qayta yozish (chegaralangan urinish),
so'ng **aynan bitta** variant kutiladi. Spec §4 dagi birlik/ҚҚС/Имтиёз tekshiruvi — oxirgi to'siq (u bu holatni ushlaydi).

### S5a — sessiya muddati
Didox sessiyasi bir necha soatdan keyin tugaydi va `/create_document` login sahifasiga qaytaradi (ilova baribir har
firma uchun qaytadan kiradi — `resetSession()` + `loginFirm`).

### S3 — "Товарни келиб чиқиши"
`ORIGIN_SERVICE_LABEL = "Хизмат кўрсатиш"`. Variantlar: Ўзи ишлаб чиқарган · **Олди-сотди** (sukut) · Хизмат кўрсатиш ·
Иштирок этмайман. Input `role=combobox` va `Mui-disabled` (qidiruv yo'q) — **ro'yxat `.MuiInputBase-root` ni haqiqiy
sichqoncha bilan bosganda ochiladi**, variantlar `li[role=option].select-v2__option`.

### S4 — saqlash va qoralama ro'yxati
- **Saqlash endpoint'i:** `POST https://api.didox.uz/v1/documents/002/create/uz` → `classifyRequest` = **allow**
  (segmentlarida `sign|tosign|send` yo'q). Sahifa `api.`/`api2.`/`gnk-api.`/`metrics.didox.uz` bilan ishlaydi — hammasi ruxsat.
  Bloklanganlar (`googletagmanager`, `fonts.googleapis.com`, `api-maps.yandex.ru`, `cnt0.www.uz`) **hech narsani buzmadi**.
- Saqlagach `/documents/new/draft?tab=all&page=1&limit=20` ga o'tadi va **yangi qator qayta yuklamasdan ko'rinadi**.
- Ro'yxat ustunlari (0-dan; v2 da boshida **checkbox ustuni** qo'shilgan): `0` checkbox · `1` xavf · `2` holat ·
  `3` tur · `4` kontragent (nom+STIR bitta matnda) · `5` hujjat № va sana · `6` shartnoma № va sana · `7` ҚҚСсиз ·
  `8` ҚҚС bilan · `9` ҚҚС. Holat katagida `div.doc-status.doc-status--white|--red` (matnsiz) — `parse.ts` mantiqi o'zgarmaydi.
- `?partner=<STIR>` filtri va `limit=100` ishlaydi; holat tablari: Барчаси / Яратилган / Ўчирилган.
- Summalar: `552 328.77` (bo'shliq ming ajratgich, nuqta), nol — `0`.
- **UUIDv1 vaqti tekshirildi:** saqlash 09:32:29–30Z, ID vaqti `09:32:30.776Z` (farq ~1 s). Haqiqiy qatorlarda
  `parseListRow` + `matchOwnDraft` ishlatildi — **aynan bitta** moslik, o'chirilgan (red) va rekvizitsiz qatorlar rad etildi.
- Qoralama sahifasi: endi **to'g'ridan-to'g'ri URL bilan ochiladi** (§2a dagi "Хато" yo'q). Tugmalar: Назад · Ўзгартириш ·
  Нусха олиш · ⛔Имзолаш · Ўчириш · Сақлаб қолиш. O'chirish: `.modal-container` "Амални тасдиқланг" →
  `.button--dark-red.alert-modal__button` → holat `.doc-status--red` "Қоралама ўчирилди".

### S5 — sessiya va til
- `persist:` partitsiyada Didox sessiyasi ilova qayta ishga tushsa ham saqlanadi → har firma uchun `resetSession()` shart.
- `document.documentElement.lang` = **`ru`**, lekin UI o'zbekcha kirill — til **hisob profilidan** keladi (localStorage/cookie'da
  emas). Ya'ni kirill matnga tayangan locator'lar shu profil sozlamasiga bog'liq. **Ochiq savol (Sir):** tilni majburlash
  (profil sozlamasi) yoki tilga bog'liq bo'lmagan locator'lar.

### S6 — oyna
- `setEnabled(false)` oynada **ham** `sendInputEvent` sichqoncha bosishi va klaviatura yozuvi sahifaga yetadi (tekshirildi).
- `capturePage` ishlaydi (xato screenshot'i olindi). **Ochiq:** `backgroundThrottling`, ekran uyqusi, yopilgan/fon oyna — c1 da.

### S7 — tashlangan forma
Server-tomon avto-saqlash **yo'q**: to'ldirilgan, lekin saqlanmagan forma yopilgandan keyin ro'yxat 13 ta bo'lib qoldi;
bitta saqlashdan keyin 14 ta bo'ldi. Sinov qoralamasi (summa `552328.77`, izoh "SINOV") **o'chirildi**; "Имзолаш" bosilmadi.

### c1 gate'idan chiqqan topilmalar (2026-10-13)

1. **Yopilgan oyna = to'xtatilgan oyna.** macOS'da Didox oynasi boshqa oyna (ilovaning o'z dialogi) bilan yopilsa,
   `document.visibilityState` **`hidden`** bo'ladi va Chromium `sendInputEvent` klaviatura hodisalarini sahifaga
   bermaydi — gate ikki marta shu sababdan yiqildi (`0_.__.____`, keyin `__.__.____`). Yechim: oynada
   `backgroundThrottling: false` + `app.commandLine` ga `disable-backgrounding-occluded-windows` va
   `disable-renderer-backgrounding`, oyna ochilganda `moveTop()`. Shundan keyin yopilgan holatda ham `visible`.
2. **"Диққат!" modali** forma yuklangandan **~2.2 s keyin** chiqadi va **o'zi yopilmaydi**. Tuzilishi:
   `div.blackout.main-alert > div.alert-app` (`.alert-app__title--info`, `.alert-app__text`,
   `.alert-app__btn > button.alert-app__button` "Ёпиш") — oldingi locator `.modal-container/.alert-modal` ni
   qidirgani uchun uni **topmagan**. Modal ochiq turganda forma maydonlariga yozib bo'lmaydi.
3. **Kontragent nomi boshqa ustunda.** STIR — "Контрагент маълумотлари" ustunida; nom/bank/direktor esa
   **"Ҳамкорингизнинг Корхонаси"** ustunida to'ladi (sotuvchiniki — "Ташкилот").
4. **МХИК tanlangach maydonlar ketma-ket to'ladi** (birlik → ҚҚС → имтиёз): darhol o'qilsa ҚҚС hali `12%` bo'lib
   turadi. Har birini alohida kutish kerak.
5. **"Акциз" yorlig'i ikki marta uchraydi** (hujjat va qator darajasida) — "yagona moslik" qoidasi ishlamaydi;
   tekshiruv "shu yorliqdagi birortasi ham belgilanmagan" shaklida.
6. To'liq zanjir shu tuzatishlardan keyin real Didox'da o'tdi: forma → saqlash → ID (`locateDraftId`) → o'chirish.

### Oyna ko'rinishi va sintetik kiritish (o'lchov, 2026-10-13)

`sendInputEvent` bilan boshqariladigan oyna **render bo'lishi shart**:

| Oyna holati | Bosish / yozish |
|---|---|
| `show: false` (hech qachon ko'rsatilmagan) | **ishlamaydi** (ogohlantirish yopilmadi) |
| `minimize()` | **ishlamaydi** (yozilmadi) |
| ko'rsatilgan, lekin fokusssiz (`showInactive`) | qisman — МХИК avtoto'ldirgichi to'lmadi |
| ko'rsatilgan, boshqa oyna bilan yopilgan | ishlaydi (occlusion kalitlari bilan) |
| ko'rsatilgan + `setOpacity(0)` + `setIgnoreMouseEvents(true)` | **ishlaydi** — to'liq zanjir uch marta tekshirildi |

Shuning uchun ilova oynani shaffof qilib ochadi (FR-8.4): ekranda hech narsa ko'rinmaydi, bosishlar ostidagi oynaga
o'tadi, lekin Chromium uni "tirik" deb hisoblaydi. **E-IMZO parol oynasi** baribir chiqadi — u E-IMZO'niki.

### Spike davomida kiritilgan tuzatishlar
`eimzo/client.ts` (Origin) · `didox/locators.ts` (`keyPicker`, `selectedKeyInn`, `byExactTextJs`) ·
`didox/view.ts` (`type` to'liq tugma ketma-ketligi, `clear` `selectAll()`). Desktop 344 test yashil, typecheck toza.

### c1 uchun qolgan savollar
1. `ққс, Миқдор` bo'shligi — spec §1 tekshiruvini moslash (bloklovchi).
2. UI tili siyosati (yuqorida).
3. jsdom drift-fixture uchun `jsdom` paketi desktop'ga qo'shiladimi (hozir yo'q) — Sir qarori.
4. `backgroundThrottling` / ekran uyqusi (S6 qoldig'i).

## 3. Ochiq savollar
1. ~~Raqam/sanasiz saqlash~~ — ha (§2a). 2. ~~Kontragent avto-to'ldirish~~ — ha. 3. ~~Ўлчов бирлиги~~ — "xizmat (so'm)".
4. ~~Qoralama ID~~ — Қоралама ro'yxatidan (§2a).
5. "Excel юклаш" — ko'p qoralamani bir yo'la yuklash formadan ishonchliroqmi?
6. ~~E-IMZO avtomatik parol spike~~ — **ishladi** (§1b).
7. ~~"Товарни келиб чиқиши" varianti matni~~ — `"Хизмат кўрсатиш"` (§2c, S3).
8. "Нусха олиш" — o'tgan oy qoralamasidan nusxa olib faqat narx/izohni o'zgartirish formadan soddaroqmi?
