# SRS — Moliyaviy yordam: foiz hisobi

> Software Requirements Specification. Living document — qaror o'zgarsa avval shu yerni yangilang.
> Oxirgi yangilanish: 2026-10-07 · **Holat: Sir tomonidan tasdiqlangan (2026-10-07)**; Didox yo'li — **partner API** (2026-10-07)

## 1. Maqsad (Goal)
Firmalar bir-biriga foizli moliyaviy yordam (qarz) beradi. Ilova har bir shartnoma bo'yicha
berilgan va qaytarilgan summalarni hisobga olib, **har oy uchun foiz summasini aniq hisoblaydi**,
qarz va foiz qoldig'ini ko'rsatadi, Excel hisobot beradi va Didox'da schyot-faktura qoralamasini
tayyorlaydi. Foydalanuvchilar — ikkala tomon (beruvchi va oluvchi) buxgalterlari.

## 2. Doira (Scope)
**Kiradi:**
- Firmalar ro'yxati (beruvchi ham, oluvchi ham bo'la oladi)
- Firmalar o'rtasidagi shartnomalar (ko'p beruvchi × ko'p oluvchi)
- Operatsiyalar: berildi / asosiy qarz qaytarildi / foiz to'landi (qo'lda kiritiladi)
- Foiz stavkasini o'zgartirish (tarix bilan)
- Oylik foiz hisoboti, qarz va foiz qoldig'i
- Excel eksport
- Didox'da schyot-faktura **qoralamasi** (imzolash — buxgalter qo'lida)
- **Didox partner API** orqali qoralama yaratish (firma Didox paroli bilan, ERI'siz)
- Serverga joylash (barcha buxgalterlar internet orqali ko'radi)

**Kirmaydi (non-goals):**
- Penya / jarima foizi
- Murakkab (kapitallashgan) foiz
- Rollar, firma bo'yicha ko'rinish cheklovi — hamma hammasini ko'radi
- Oyni yopish / bloklash
- Bank ko'chirmasidan import, 1C integratsiya
- Ko'p valyuta (faqat UZS)
- Fakturani avtomatik imzolash / yuborish
- Didox cookie/sessiyasini olish yoki Didox'ning ichki (hujjatlashtirilmagan) API'sidan foydalanish — **taqiqlangan**
- Soliq bo'yicha qaror (MXIK kodi, QQS stavkasi buxgalter tomonidan beriladi)

## 3. Foydalanuvchilar / aktyorlar
- **Buxgalter** (beruvchi yoki oluvchi firmadan) — bitta umumiy login bilan kiradi, barcha
  ma'lumotni ko'radi va o'zgartiradi. Rollar yo'q.

## 4. Hisoblash qoidalari (yadro — barcha modullar shunga bo'ysunadi)

- **CR-1 Kunlik hisob (B qoidasi):** har kalendar kuni `D` uchun
  `foiz(D) = Qoldiq(D) × Stavka(D) / 100 / YilKunlari(D)`,
  bu yerda `Qoldiq(D)` — `D` kuni **oxiridagi** asosiy qarz qoldig'i:
  `Σ berildi (sana ≤ D) − Σ asosiy qarz qaytarildi (sana ≤ D)`.
  Ya'ni pul berilgan kun hisobga kiradi; qaytarilgan kun yangi (kamaygan) qoldiq bilan hisoblanadi.
- **CR-2 Yil kunlari:** `D` kalendar yiliga qarab 365 yoki 366 (actual/actual). 2026 va 2027 — 365.
- **CR-3 Oddiy foiz:** foiz faqat asosiy qarzga hisoblanadi; to'lanmagan foizga foiz hisoblanmaydi.
- **CR-4 Oylik foiz:** `Oy foizi = Σ foiz(D)` oy kunlari bo'yicha. Ichki hisobda **yaxlitlash yo'q**
  (aniq kasr: butun sonlar — tiyin × stavka × kun — bitta bo'lish). Hisobot, Excel va faktura uchun oy yakuni
  **2 xonagacha** (tiyin) yaxlitlanadi: **yarmi noldan uzoqqa** (0,5 tiyin → 1; −0,5 tiyin → −1).
- **CR-5 Stavka o'zgarishi:** buxgalter yangi stavkani `o'zgartirish sanasi` bilan kiritadi.
  - sana oyning **1-kuni** bo'lsa → shu kundan amal qiladi;
  - aks holda → **keyingi oyning 1-kunidan** amal qiladi.
  - Boshlang'ich stavka shartnoma boshlanish sanasidan amal qiladi.
  - Bir xil `amal qilish sanasi`ga bir nechta o'zgarish bo'lsa — oxirgi kiritilgani amal qiladi.
- **CR-6 Muddatdan keyin:** shartnoma muddati tugaganda asosiy qarz qolsa, foiz **amaldagi stavka
  bo'yicha hisoblanishda davom etadi**, qoldiq 0 bo'lguncha. Penya yo'q.
- **CR-7 Limit:** shartnoma summasi — **jami berilgan** summa chegarasi. Qaytarilgan summa limitni tiklamaydi.
- **CR-8 Foiz to'lovi:** faqat foiz qarzini kamaytiradi, foiz hisobiga ta'sir qilmaydi.
  `Foiz qarzi = Σ oy foizlari (yaxlitlangan) − Σ foiz to'lovlari`.
- **CR-9 Qayta hisob:** hisobot har doim operatsiyalardan qayta hisoblanadi (saqlangan "kesh" haqiqat
  manbai emas). O'tgan sanaga operatsiya kiritilsa yoki o'zgartirilsa — hisob avtomatik yangilanadi.

- **CR-11 Bugungacha:** barcha hisob (qoldiq, jamilar, oylik hisobot, foiz qarzi) `sana ≤ bugun` bo'lgan
  operatsiyalardan. Kelajak sanali operatsiya saqlanadi ("rejalashtirilgan"), sanasi kelganda hisobga kiradi.
  Boshlanishdan oldingi operatsiyalar qoldiqqa kiradi, foiz esa faqat boshlanish sanasidan (CR-5). Sir, 2026-10-07.
- **CR-10 Manfiy qoldiq:** asosiy qarz qoldig'idan ko'p qaytarilsa (ogohlantirish bilan saqlanadi),
  qoldiq **manfiy** bo'ladi va CR-1 formulasi o'zgarmasdan qo'llanadi — o'sha kunlar uchun foiz
  **manfiy** (beruvchi oluvchidan qarzdor). Sir qarori, 2026-10-07.

**Etalon misol (acceptance test):** shartnoma 2026-01-01, stavka 14%; 05.01 — 60 000 000 berildi;
20.01 — 15 000 000 asosiy qarz qaytarildi.
60 000 000 × 15 kun (5–19) + 45 000 000 × 12 kun (20–31) → **yanvar foizi = 552 328,77 so'm**
(aniq qiymat 201 600 000 / 365 = 552 328,767123…).

## 5. Funktsional talablar (modullar bo'yicha)

### Modul 1: Kirish va firmalar
- FR-1.1 — Bitta umumiy login/parol bilan kirish (credentials server konfiguratsiyasida, parol hash'langan).
- FR-1.2 — Firma qo'shish / tahrirlash / ro'yxat. Maydonlar (schyot-faktura rekvizitlari, §9.1):
  nomi, manzil, STIR (INN, 9 raqam), QQS to'lovchi registratsiya kodi (ixtiyoriy),
  hisob raqami (р/с, 20 raqam), MFO (5 raqam).
  Majburiy — faqat **nomi va STIR**; manzil, р/с, MFO keyin to'ldirilishi mumkin (odatda FR-1.3 importi
  bilan). To'ldirilmagan firma ro'yxatda "Rekvizitlar to'liq emas" belgisi bilan ko'rinadi (Sir, 2026-10-09).
  Didox ulanishi (faqat beruvchi firmalar uchun) — Modul 8 da qo'shiladi.
- FR-1.3 — **Didox faktura fayllaridan import:** buxgalter Didox'dan yuklab olingan schyot-faktura
  fayl(lar)ini (`.xls`, ichi HTML; §9.1 namunasi) tanlaydi → har fayldan **sotuvchi va xaridor**
  rekvizitlari olinadi (nomi, manzil, STIR, QQS kodi, р/с, MFO).
  - Bir yo'la bir nechta fayl (≤ 50 ta, har biri ≤ 1 MB).
  - Avval **ko'rib chiqish:** har firma uchun holat — `yangi` / `yangilanadi` (qaysi maydonlar) /
    `o'zgarishsiz` / `xato` (sababi). O'qib bo'lmagan fayl — alohida fayl xatosi.
  - Bir STIR bir nechta faylda bo'lsa — **faktura sanasi eng yangi** fayldagi rekvizitlar olinadi.
  - Buxgalter tasdiqlagach qo'llanadi: yangilar qo'shiladi, mavjudlar (STIR bo'yicha) yangilanadi,
    xatolilar o'tkazib yuboriladi. Qoidalar FR-1.2 bilan bir xil.
  - Yorliqlar: rus tilidagi Didox eksporti (namuna bilan tasdiqlangan) va o'zbek (kirill) varianti
    (Didox UI'dan olingan, haqiqiy fayl bilan **tekshirilmagan**).
- *Acceptance:* login'siz hech qaysi sahifa/API ochilmaydi; firma qo'shilib ro'yxatda ko'rinadi;
  namunaviy faktura fayli yuklanganda ikkala firma ko'rib chiqishda chiqadi va tasdiqdan keyin ro'yxatga tushadi.

### Modul 2: Shartnoma yaratish
- FR-2.1 — Shartnoma: raqami, sanasi, beruvchi firma, oluvchi firma, summa (limit),
  boshlanish va tugash sanasi, boshlang'ich yillik stavka (%). Boshlang'ich stavka stavkalar
  tarixining birinchi yozuvi bo'ladi va boshlanish sanasidan amal qiladi (CR-5).
- FR-2.2 — Beruvchi va oluvchi bir xil firma bo'lolmaydi. Tugash sanasi boshlanishdan keyin;
  limit > 0; 0 < stavka ≤ 100.
- FR-2.3 — Shartnomalar ro'yxati: №, sana, beruvchi → oluvchi, limit, muddat, joriy stavka.
  "Jami berilgan" va "asosiy qarz qoldig'i" ustunlari — Modul 3 da, "foiz qarzi" — Modul 4 da qo'shiladi.
- FR-2.4 — Shartnoma raqami **bir beruvchi–oluvchi juftligi ichida** takrorlanmaydi
  (boshqa juftlikda bir xil raqam mumkin).
- FR-2.5 — Tahrirlash: raqam, sana, limit, muddat. Tomonlar — shartnomada operatsiya bo'lmaguncha
  (Modul 3 bu cheklovni qo'shadi). Stavka bu yerda tahrirlanmaydi — faqat Modul 5 (tarix orqali).
- FR-2.6 — Shartnoma sahifasi (`/contracts/:id`): rekvizitlar, tomonlar, stavka; keyingi modullar
  (operatsiyalar, hisobot) shu sahifaga qo'shiladi.
- *Acceptance:* A→B, A→C, E→B shartnomalar yaratiladi va ro'yxatda ko'rinadi; etalon shartnoma
  (10 000 000 000, 14%, 01.01.2026–31.07.2027) to'g'ri saqlanadi va ko'rsatiladi.

### Modul 3: Operatsiyalar
- FR-3.1 — Operatsiya kiritish: sana, turi (`berildi` / `asosiy qarz qaytarildi` / `foiz to'landi`), summa (> 0), izoh.
- FR-3.2 — Operatsiyani tahrirlash va o'chirish (o'chirish — tasdiq bilan). Hisob har doim qayta hisoblanadi (CR-9).
- FR-3.3 — Ogohlantirishlar (**bloklamaydi**). "Saqlash" bosilganda forma ichida ko'rsatiladi; buxgalter
  **"Baribir saqlash"** bilan tasdiqlaydi. Ogohlantirish bo'lmasa — darhol saqlanadi:
  - jami berilgan > limit (qanchaga oshishi bilan);
  - operatsiyadan keyin asosiy qarz qoldig'i **manfiy** bo'ladigan sana (CR-10);
  - operatsiya sanasi shartnoma boshlanishidan oldin;
  - muddatdan keyin `berildi` operatsiyasi.
  - "Foiz to'lovi > foiz qarzi" — **Modul 4** da (foiz hisobi kerak).
- FR-3.4 — Shartnoma sahifasida operatsiyalar jadvali: sana, berildi, qaytarildi, foiz to'landi,
  har operatsiyadan keyingi qoldiq, izoh.
- FR-3.5 — Shartnoma kartasida va ro'yxatda: **jami berilgan** va **asosiy qarz qoldig'i** (FR-2.3).
- FR-3.6 — Operatsiyasi bor shartnomada tomonlarni o'zgartirib bo'lmaydi (FR-2.5).
- *Acceptance:* 05.01 — 60 000 000 berish va 20.01 — 15 000 000 qaytarishdan keyin qoldiq 45 000 000;
  limitdan oshganda ogohlantirish chiqadi, "Baribir saqlash" bilan saqlanadi.

### Modul 4: Oylik foiz hisoboti (yadro)
- FR-4.1 — Shartnoma bo'yicha oylik jadval — **boshlanish oyidan joriy oygacha** (joriy oy "bugungacha"
  belgisi bilan): oy, stavka, oy boshidagi qoldiq, berildi, qaytarildi, oy oxiridagi qoldiq, hisoblangan foiz,
  to'langan foiz, foiz qarzi (yig'ma). `boshidagi + berildi − qaytarildi = oxiridagi`.
- FR-4.2 — Oy ichidagi bo'laklar (davr, qoldiq, stavka, kun, foiz — 6 xona) — ochiladigan tafsilot.
- FR-4.3 — Hisob CR-1…CR-11 ga to'liq mos; yadro sof funksiya, mustaqil kunma-kun hisob bilan tekshirilgan.
- FR-4.4 — **Foiz qarzi** (ro'yxat va shartnoma kartasi) — **tugagan oylar** bo'yicha (faktura bilan bir xil);
  shartnoma sahifasida qo'shimcha "bugungacha hisoblangan" foiz.
- FR-4.5 — Ogohlantirishlar (FR-3.3 ga qo'shimcha): **foiz to'lovi > to'lov sanasigacha hisoblangan foiz qarzi**
  (tugagan oylar + to'lov oyi to'lov kunigacha, yaxlitlangan − boshqa foiz to'lovlari); **kelajak sana** (CR-11).
- *Acceptance:* etalon → yanvar 552 328,77; fevral 2026 → 483 287,67; kabisa fevral 2028; oy o'rtasidagi start,
  1-sanadan stavka o'zgarishi, manfiy qoldiq, muddatdan keyingi oy — testlar bilan; yadro tasodifiy ma'lumotda
  kunma-kun hisob bilan tiyinigacha teng.

### Modul 5: Stavkani o'zgartirish
- FR-5.1 — Yangi stavka + o'zgartirish sanasi (default — bugun; o'tgan yoki kelajak sana ham mumkin).
  Amal qilish sanasi CR-5 bo'yicha avtomatik hisoblanib, kiritish paytida ko'rsatiladi. Amal qilish sanasi
  boshlang'ich stavka sanasidan (shartnoma boshlanishi) **keyin** bo'lishi shart.
- FR-5.2 — Stavkalar tarixi shartnoma sahifasida (amal qiladi, kiritilgan sana, stavka).
- FR-5.3 — Boshlang'ich stavkadan boshqa istalgan o'zgarishni **o'chirish** (tasdiq bilan). Tahrir yo'q —
  noto'g'risi o'chirilib, to'g'risi qayta kiritiladi.
- FR-5.4 — Boshlang'ich stavkaning faqat **qiymatini** tuzatish (sanasi o'zgarmaydi).
- FR-5.5 — Ogohlantirish (bloklamaydi, "Baribir saqlash"): amal qilish sanasi **tugagan oyga** tushsa yoki
  boshlang'ich stavka tuzatilsa — qaysi tugagan oylar qayta hisoblanishi ko'rsatiladi (faktura yuborilgan bo'lishi mumkin).
- *Acceptance:* 15-martda kiritilgan stavka 1-apreldan, 1-aprelda kiritilgani 1-apreldan amal qiladi;
  aprel foizi yangi stavka bilan hisoblanadi.

### Modul 6: Excel eksport
- FR-6.1 — Shartnoma sahifasida "Excel yuklab olish" → `.xlsx`, **serverda** Modul 4 hisobot natijasidan
  (CONSTITUTION §11). Fayl nomi: `Shartnoma_<№>_<beruvchi>_<sana>.xlsx`.
- FR-6.2 — Varaqlar: **"Oylik hisobot"** (sarlavhada rekvizitlar: shartnoma № va sanasi, beruvchi/oluvchi STIR bilan,
  limit, muddat, joriy stavka, hisobot sanasi; oylik jadval + jami; joriy oy belgisi), **"Bo'laklar"** (FR-4.2),
  **"Operatsiyalar"** (berildi/qaytarildi/foiz to'landi, qoldiq, izoh — akt sverka sifatida).
- FR-6.3 — Summalar Excel'da **raqam** (`# ##0,00`), hisob-kitob qilsa bo'ladi. 15 muhim xonadan uzun summa
  (Excel aniqlik chegarasi) — aniqlik yo'qolmasligi uchun **matn**.
- FR-6.4 — Barcha shartnomalarni bitta faylga eksport — **kirmaydi** (keyinroq alohida modul bo'lishi mumkin).
- *Acceptance:* yuklab olingan fayl ekrandagi raqamlar bilan tiyinigacha mos (e2e fayl qayta o'qilib solishtiriladi).

### Modul 7: Oylik faktura ro'yxati (ilovada)
- FR-7.1 — Oy tanlanadi → shu oy uchun foizi > 0 bo'lgan har shartnoma bo'yicha bitta faktura qatori:
  beruvchi, oluvchi (STIR), shartnoma № va sanasi, qator nomi (§9.1 shabloni), summa.
- FR-7.2 — Bitta faktura = bitta shartnoma × bitta oy, bitta qator. Tarkibi §9.1 ga mos.
- FR-7.3 — Faktura summasi = shu oy uchun yaxlitlangan foiz (CR-4) — Modul 4 yadrosidan olinadi.
- FR-7.4 — Holat: `tayyor` / `qoralama yaratildi` (sana, Didox hujjat ID bilan). Holatni Modul 8 yoki
  buxgalter qo'lda belgilaydi. `qoralama yaratildi` bo'lsa qayta yaratishda ogohlantirish.
- FR-7.5 — Ro'yxatni beruvchi firma bo'yicha filtrlash; har maydonni bir bosishda nusxalash
  (Didox ulanmagan firma uchun ham qo'lda kiritish oson bo'lsin).
- *Acceptance:* etalon shartnoma uchun yanvar qatori 552 328,77 va to'g'ri qator nomi bilan chiqadi.

### Modul 8: Didox API integratsiyasi — avtomatik qoralamalar
- FR-8.1 — **Didox akkauntlari** (alohida ro'yxat): login (STIR yoki PINFL), Didox akkaunt paroli,
  bog'langan beruvchi firmalar. Bitta akkaunt → **bir nechta firma** (bitta buxgalter ko'p firmani yuritadi).
  Parol **shifrlangan** saqlanadi, UI'da qayta ko'rsatilmaydi, log'ga yozilmaydi.
- FR-8.2 — Kirish turi **avtomatik** aniqlanadi: akkaunt logini firma STIR'iga teng bo'lsa — to'g'ridan-to'g'ri;
  aks holda akkaunt bilan kirib, har firmaga `POST /v1/auth/company/{tin}/login`. Login javobidagi
  `related_companies` dan akkaunt qaysi firmalarga kira olishi ko'rsatiladi (bog'lashda yordam).
  "Ulanishni tekshirish" tugmasi — bitta login urinishi.
- FR-8.3 — **Avtomatik ishga tushish:** har oyning **1-kuni soat 06:00** (Asia/Tashkent, sozlanadi) — natija
  **09:00 gacha tayyor** bo'lishi shart. Ilova o'tgan oy
  uchun Modul 7 ro'yxatidagi **barcha** `tayyor` fakturalar bo'yicha: har akkauntga bir marta kiradi →
  har firmaga o'tadi → har faktura uchun `POST /v1/documents/002/create` → Didox hujjat ID + holat
  `qoralama yaratildi`. Ilovada alohida tasdiqlash qadami **yo'q**.
- FR-8.3a — Vaqtinchalik xatolar (tarmoq, timeout, Didox 5xx) uchun avtomatik qayta urinish **07:00 va 08:00** da —
  faqat xato bo'lgan fakturalar. Login xatolariga bu tegishli emas (FR-8.8).
- FR-8.4 — Qo'lda ishga tushirish ham bor ("Hozir yaratish" — tanlangan oy uchun); xatoga uchragan
  fakturalar uchun "Qayta urinish".
- FR-8.5 — **Takror yo'q:** bitta shartnoma × oy uchun qoralama faqat bir marta yaratiladi
  (`qoralama yaratildi` bo'lsa o'tkazib yuboriladi).
- FR-8.6 — Qoralama tarkibi §9.1 ga mos: sotuvchi = beruvchi firma, xaridor STIR, shartnoma № va sanasi,
  bitta qator (MXIK, nom, birlik, miqdor 1, narx, "Без НДС" + imtiyoz maydonlari, kelib chiqishi — xizmat).
  **Faktura raqami va sanasi bo'sh** — buxgalter Didox'da qo'yadi (API qabul qilmasa — §9.2 ochiq savol).
- FR-8.7 — Har ishga tushish natijasi ilovada: akkaunt/firma bo'yicha nechta yaratildi, nechta xato
  (sababi — Didox javobi tushunarli matn bilan).
- FR-8.8 — **Login xatosida avtomatik qayta urinish yo'q** (25 noto'g'ri urinish → akkaunt doimiy bloklanadi):
  401/422/423/429 dan keyin akkaunt "tekshirish kerak" holatiga o'tadi, shu akkauntning qolgan firmalari
  o'tkazib yuboriladi, boshqa akkauntlar davom etadi.
- FR-8.9 — Ilova **hech qachon** imzolamaydi, yubormaydi (`tosign`/`sign` chaqirilmaydi). Imzolash —
  buxgalter Didox'da: raqam/sana qo'yadi va qoralamalarni **birdaniga** imzolaydi.
- FR-8.10 — Partner token va API URL server `.env` da; test (`testapi3`) va prod (`api-partners`) muhitlari.
- *Acceptance:* test muhitida 1 akkaunt × 2 firma × bir nechta shartnoma → "Hozir yaratish" → har firma
  Ҳужжатлар → Қоралама'da §9.1 ga mos qoralamalar; qayta ishga tushirish takror yaratmaydi;
  noto'g'ri parol bilan bitta urinishdan keyin to'xtaydi.
- *Blokerlar:* partner token (test) — Sir Didox'ga yozadi (mijoz nomidan); §9.2 ochiq savollar.

### Modul 9: Serverga joylash
- FR-9.1 — Docker Compose (api + web + PostgreSQL + reverse proxy, HTTPS).
- FR-9.2 — DB zaxira nusxasi (backup).
- FR-9.3 — Prod partner token va shifrlash kaliti serverga xavfsiz o'rnatiladi (Sir qo'li bilan).
- *Acceptance:* buxgalterlar server manzili orqali kirib ishlay oladi.

### Modul 10: Kiritish qulayliklari (Sir, 2026-10-09)
- FR-10.1 — Barcha summa maydonlari **yozilayotganda** formatlanadi: `2000000` → `2 000 000`, kasr — vergul
  (`1 234,5`). Kursor joyi saqlanadi; nusxa joylanganda ham ishlaydi.
- FR-10.2 — Sana tekshiruvi (barcha sana maydonlari: shartnoma, operatsiya, stavka): mavjud bo'lmagan sana
  (yil 4 xonali emas, 31-fevral) va **2000–2100 oralig'idan tashqari yil** — maydon ostida xato. Server ham tekshiradi.
- FR-10.3 — Oylik hisobot jadvalida **yil filtri** (default — joriy yil; "Barcha yillar" ham bor).
- *Acceptance:* `2000000` yozilsa maydonda `2 000 000` ko'rinadi va `2000000.00` saqlanadi; `20266` yilli sana
  saqlanmaydi; hisobotda 2025 tanlansa faqat 2025 oylari.

### Modul 11: Shartnomalar ro'yxati — qidiruv, filtr, saralash (Sir, 2026-10-09)
- FR-11.1 — Qidiruv: shartnoma raqami, beruvchi/oluvchi nomi yoki STIR bo'yicha.
- FR-11.2 — Filtr paneli: Beruvchi, Oluvchi, imzo sanasi oralig'i. Filtrlar manzilda saqlanadi (havola bilan ulashsa bo'ladi).
- FR-11.3 — Ustun sarlavhasini bosish — shu ustun bo'yicha saralash (o'sish/kamayish).
- FR-11.4 — "Tomonlar" o'rniga **Beruvchi** va **Oluvchi** alohida ustunlar; nom ostida STIR raqami ("STIR" so'zisiz).
- *Acceptance:* demo ma'lumotda "GAMMA" qidirilsa 2 ta shartnoma; Oluvchi = DELTA AGRO filtri 2 ta; foiz qarzi bo'yicha saralash.

### Modul 12: Davr hisoboti va Excel (Sir, 2026-10-09)
- FR-12.1 — Shartnomalar sahifasida **davr** tanlanadi: butun oylar (boshlanish oyi — tugash oyi), tezkor tanlov:
  joriy oy, o'tgan oy, chorak, yil. Davr tanlanmasa — hozirgi ko'rinish (bugungi holat).
- FR-12.2 — Davr tanlanganda har shartnoma uchun: davr ichida **berildi, qaytarildi, hisoblangan foiz,
  to'langan foiz**; davr oxiriga **qoldiq va foiz qarzi**. Joriy oy davrga kirsa — bugungacha (CR-11).
  Foiz = davr oylarining yaxlitlangan oylik foizlari yig'indisi (fakturalar bilan tiyinigacha mos, CONSTITUTION §11).
- FR-12.3 — Excel: **ekrandagidek** — bitta varaq, joriy filtr/qidiruvdagi shartnomalar, shu ustunlar, pastda jami qator.
  Bu FR-6.4 dagi "barcha shartnomalar eksporti" o'rnini bosadi.
- *Acceptance:* etalon shartnoma, davr Yanvar–Fevral 2026: berildi 60 mln, qaytarildi 15 mln, foiz 1 035 616,44,
  qoldiq 45 mln; Excel ekran bilan tiyinigacha mos.

## 6. Nofunktsional talablar
- **Aniqlik:** pul va stavka hech qachon `float`'da hisoblanmaydi — DB'da `Decimal`, kodda decimal kutubxona
  yoki butun son (BigInt, tiyin) — foiz yadrosi BigInt'da.
- **Performance:** bitta shartnoma hisoboti (19+ oy, yuzlab operatsiya) < 1 s.
- **Security:** HTTPS; parol hash'langan; login urinishlariga rate-limit; secret'lar `.env`'da, repo'da emas.
  Didox akkaunt parollari DB'da **shifrlangan** (AES-256-GCM, kalit `.env` da); ERI kaliti va .pfx
  hech qachon saqlanmaydi. Didox token (360 daq) faqat xotirada/qisqa muddat keshlanadi.
- **Reliability:** kunlik DB backup.
- **Til / format:** UI o'zbek (lotin); sana `dd.mm.yyyy`; summa `552 328,77`.

## 7. Tech stack & arxitektura
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + TypeScript + shadcn/ui + Tailwind
- Infra: Docker Compose, server (Sir'niki)
- Arxitektura eslatmalari:
  - **Foiz hisoblash yadrosi — sof funksiya** (DB/HTTP'siz): kirish — shartnoma, stavkalar tarixi,
    operatsiyalar; chiqish — kunlik bo'laklar va oylik jadval. Barcha CR qoidalari shu yerda va
    shu yerda test qilinadi.
  - Monorepo: `apps/api`, `apps/web`.
  - Didox — `apps/api` ichida alohida adapter modul (`didox`): auth, qoralama yaratish; boshqa kod
    Didox HTTP tafsilotlarini bilmaydi.

## 8. UI/UX
- Dizayn manbai: `design/` papka hozircha yo'q — oddiy, toza admin-panel uslubi (shadcn).
- Asosiy ekranlar: Kirish → Shartnomalar ro'yxati → Shartnoma sahifasi (operatsiyalar, stavkalar,
  oylik hisobot, eksport) → Firmalar.

## 9. Tashqi bog'liqliklar / integratsiyalar
- **Didox** (didox.uz) — schyot-faktura qoralamasi, rasmiy **partner API** orqali (§9.2).

### 9.1 Schyot-faktura namunasi (Sir bergan, 2026-09 dagi haqiqiy faktura asosida)
> Haqiqiy firma rekvizitlari repo'ga yozilmaydi — faqat tuzilma.

| Maydon | Manba | Namunadagi qiymat / format |
|---|---|---|
| Hujjat turi | doimiy | Счет-фактура без акта |
| Faktura № va sanasi | buxgalter (§10) | `№ 690 от 15.09.2026` — oy tugaganidan keyin |
| Shartnoma | Contract | `к договору № {raqam} от {dd.mm.yyyy}` |
| Yetkazib beruvchi | beruvchi Firm | nomi, manzil, INN, QQS reg. kodi, р/с, MFO |
| Xaridor | oluvchi Firm | nomi, manzil, INN, QQS reg. kodi, р/с, MFO |
| Qator nomi | shablon | `Берилган молиявий ёрдамнинг фоиз куринишидаги даромади за {oy} {yyyy} г.` (oy ruscha: август) |
| MXIK (ИКПУ) kodi | sozlama | `10401999001000000` — "Маблағларни ўтказиш билан боғлиқ молиявий операциялар (мукофот тўловларидан ташқари)" |
| O'lchov birligi | doimiy | xizmat (so'm) |
| Miqdor | doimiy | 1 |
| Narx = Qiymat | Modul 4 | oy foizi, 2 xona (CR-4) |
| QQS | sozlama | Без НДС |
| Kelib chiqishi | doimiy | Оказание услуг |

Tekshiruv: namunadagi summa `43 572 602,74 × 365 = 15 904 000 000,10` — ya'ni amaldagi hisob
**365 kunlik** asosda yuritilgan; CR-2 bilan mos.

Mijoz bilan suhbat (2026-10-07) natijasida:
- Qator nomi shabloni, MXIK, birlik, miqdor, "Без НДС", "Оказание услуг" — **hech qachon o'zgarmaydi**,
  barcha shartnomalar uchun bir xil. Faqat oy nomi va narx (oy foizi) o'zgaradi.
- Faktura raqami va sanasini **buxgalter Didox'da o'zi** qo'yadi (ilova bo'sh qoldiradi).

### 9.2 Didox'dagi qo'lda jarayon (skrinshotlar asosida) va spike savollari
Hozir buxgalter qo'lda: Ҳужжатлар → Яратиш → tur **"Ҳисоб-фактура актсиз" / "Стандарт"** →
"Сизнинг маълумотларингиз" (sotuvchi) **Didox akkauntidagi joriy firmadan avtomatik** to'ladi →
kontragent STIR kiritiladi, nomi o'zi chiqadi → qator to'ldiriladi (QQS default 12% → "Без НДС",
shunda QQS imtiyozi o'zi qo'yiladi; "Олди-сотди" → "Хизмат кўрсатиш") → **Сақлаб қолиш** → qoralama.
Didox qo'lda saqlashda bo'sh majburiy maydonlarga ruxsat beradi.

Spike natijasi — to'liq: [research/didox.md](research/didox.md) (2026-10-07; asosiy da'volar rasmiy hujjatda qayta tekshirildi):
- [x] Rasmiy partner API bor: `api-docs.didox.uz`. Kerak: **partner token** (Didox account manager beradi).
  Test: `testapi3.didox.uz`, prod: `api-partners.didox.uz`.
- [x] Qoralama: `POST /v1/documents/002/create/{locale}` — "Создаёт документ в черновиках", imzosiz.
  `update` / `delete/draft` ham bor.
- [x] Kirish **.pfx'siz** mumkin: `POST /v1/auth/{taxId}/password/{locale}` — firma Didox paroli bilan
  ("Вход без ЭЦП"). Token 360 daqiqa. ⚠️ Noto'g'ri parol: 3/daq → 10 daq blok, 10 → 24 soat,
  **25 → doimiy blok** — ilova hech qachon avtomatik qayta urinmaydi.
- [x] Ko'p firma: bitta partner token + har firma uchun alohida `user-key` (firma paroli orqali).
- [ ] Bo'sh `FacturaNo` / `FacturaDate` bilan API qoralamani qabul qiladimi — hujjatda majburiy; testda tekshiriladi.
- [ ] "Без НДС" uchun `LgotaId` qiymati hujjatda yo'q — buxgalter yaratgan namunaviy qoralamani API orqali o'qib olinadi.
- [x] "Excel юклаш" — ommaviy API emas, faqat UI ichida; zaxira yo'l sifatida qoladi.

**Tanlangan yo'l (Sir, 2026-10-07, yakuniy): partner API + firma Didox akkaunt paroli.**
Serverda: partner token (`.env`) va har beruvchi firmaning Didox paroli (shifrlangan). ERI kaliti
serverga **berilmaydi** — imzo faqat buxgalterda. Firma paroli — ERI (.pfx) paroli emas, Didox'da
ro'yxatdan o'tishda o'rnatilgan akkaunt paroli ([research/didox-partner-token.md](research/didox-partner-token.md)).

Ko'rib chiqilib rad etilgan: "Excel юклаш" (Sir rad etdi); ilovani buxgalter kompyuterida ishlatish
(API ehtiyojini yo'qotmaydi); Didox cookie / ichki API (**taqiqlangan** — rasmiy emas, akkaunt bloklanishi
xavfi); brauzer kengaytmasi (Sir API'ni tanladi).

## 10. Ochiq savollar (Sir hal qiladi)
- [x] Stavka `o'zgartirish sanasi` — buxgalter kiritadigan maydon (default bugun) — SRS bilan tasdiqlandi
- [x] Didox: qoralama namunasi — berildi (§9.1)
- [x] UI tili — faqat o'zbek (lotin)
- [x] Faktura raqami — buxgalter Didox'da o'zi qo'yadi
- [x] Faktura sanasi — buxgalter Didox'da o'zi qo'yadi
- [x] Qator nomi, MXIK, "Без НДС" — doimiy, barcha shartnomalar uchun bir xil
- [x] Har MCHJ'ning **o'z Didox login'i** bor; buxgalter ERI (.pfx) kaliti bilan kiradi
- [x] Didox yo'li — partner API
- [x] Partner token — Sir Didox account manager'ga yozadi; token **mijoz nomidan**
- [x] Bitta buxgalter — bir nechta firma; buxgalterlar Didox akkaunt parolini biladi
- [x] Kirish va qoralama yaratish **to'liq avtomatik** (oy 1-kuni); ilovada tasdiqlash qadami yo'q
- [x] Imzolash — buxgalter Didox'da qoralamalarni birdaniga imzolaydi; raqam/sanani Didox'da o'zi qo'yadi
- [ ] Didox UI'da bir nechta qoralamani birdaniga imzolash imkoni — TEKSHIRILMADI (Didox tomoni, ilovaga ta'sir qilmaydi)
- [ ] API bo'sh `FacturaNo`/`FacturaDate` bilan qoralamani qabul qiladimi — test muhitida
- [x] Avtomatik ishga tushish — oy 1-kuni, 09:00 gacha tayyor (start 06:00, qayta urinish 07:00/08:00); natija faqat ilovada
- [ ] Server: OS, domen, kim boshqaradi (Modul 9 gacha)
