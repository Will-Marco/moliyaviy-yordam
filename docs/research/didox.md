# Didox.uz integratsiyasi — tadqiqot

Sana: 2026-10-07. Til: o'zbekcha (lotin), texnik atamalar inglizcha.
Maqsad: ikki MCHJ o'rtasidagi qarz foizi uchun "Счет-фактура без акта" (doctype `002`, "Стандарт") **qoralamasini (draft)** Didox'da imzosiz yaratish. Imzolashni buxgalter Didox UI'da E-IMZO bilan qiladi.

Belgilar: **[TASDIQLANDI]** — rasmiy manbada ko'rsatilgan. **[XULOSA]** — manbadan kelib chiqqan mening xulosam (to'g'ridan-to'g'ri yozilmagan). **TEKSHIRILMADI** — tasdiqlab bo'lmadi, taxmin qilinmaydi.

Hujjatdagi barcha namunalar (INN, kompaniya nomlari, hisob raqamlar) olib tashlangan; o'rniga `<PLACEHOLDER>` ishlatilgan.

---

## 1. Xulosa (TL;DR)

**Tavsiya: API yo'li (Variant A), Excel upload — zaxira (Variant B).**

Sabablari:

1. Didox'da rasmiy partner API **bor** va aynan kerakli narsani qiladi: `POST /v1/documents/002/create/{locale}` — "Создаёт документ в черновиках" (imzo talab qilinmaydi). Qoralamani keyin yangilash (`/update`) va o'chirish (`/delete/draft`, "Подпись не требуется") ham mumkin. [api-docs.didox.uz/ru/integrators-documents](https://api-docs.didox.uz/ru/integrators-documents)
2. **Autentifikatsiya .pfx'siz ishlaydi**: parol bilan token olish (`POST /v1/auth/{taxId}/password/{locale}`), token 360 daqiqa. Ya'ni server har bir kompaniya uchun parol saqlaydi, ERI kaliti kerak emas. [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home) Lekin bu kompaniya Didox'da parol o'rnatgan bo'lishini talab qiladi (**TEKSHIRILMADI**, 2-bo'limga qarang).
3. Birgina **partner token** hamma kompaniyalar uchun; kompaniya tokeni (`user-key`) alohida olinadi.
4. Excel upload'ning ommaviy API'si hujjatlarda **yo'q**. Faqat Didox veb-ilovasi ichida "Импорт Excel (ЭСФ)" bor, "Добавить в черновик" tugmasi bilan (6-bo'lim). Bu qo'lda ish, avtomatlashtirib bo'lmaydi.

**Didox'dan / mijozdan so'rash kerak:**

| # | Kimdan | Nima |
|---|---|---|
| 1 | Didox account manager | Partner token (test va prod). Shartlar/narx hujjatda yo'q. Kontakt (hujjatda ko'rsatilgan): Telegram `@Didox_account`, tel. +998 50 122 05 18 |
| 2 | Didox account manager | Test muhitida (`testapi3.didox.uz`) partner token ishlashini, test kompaniyalar/parollarini tasdiqlash |
| 3 | Mijoz (buxgalter) | Har bir kompaniya Didox'da **parol** bilan kirish o'rnatganmi (faqat ERI bilan kiradimi)? Aks holda parol o'rnatish kerak |
| 4 | Mijoz (buxgalter) | Didox UI'da qo'lda bitta namunaviy qoralama yaratib berish (to'liq to'ldirilgan, "Без НДС" bilan) — biz uni `GET /v1/documents/{id}?owner=1` bilan o'qib, aniq JSON shaklini va `lgota` maydonlarini olamiz |
| 5 | Mijoz (buxgalter) / soliq maslahatchi | Foiz daromadi uchun QQS imtiyozi (St. 244 NK, 7-band) my.soliq.uz'da ariza orqali rasmiylashtirilganmi (4-bo'lim) |
| 6 | Didox support | Bo'sh `FacturaNo`/`FacturaDate`/`BuyerTin` bilan API orqali qoralama saqlash mumkinmi (3-bo'lim) |

---

## 2. Savol 1 — Ommaviy/partner API, hujjatlar, kirish

**Topilma [TASDIQLANDI]:**

- Rasmiy API hujjatlari: `https://api-docs.didox.uz` (Wiki.js saytida, mazmuni rus tilida, kompaniya: "DIDOX TECH" OOO). Bo'limlar: 01 E-IMZO bilan ishlash, 02 Ro'yxatdan o'tish, 03 Login, 04 Akkaunt, 05 Profil, 06 Hujjatlar, 07 Hujjatlar JSON'i, 08 Utilitlar, 09 Kataloglar, 10 Hujjat shablonlari, 11 Oferta imzolash. Sahifalar ro'yxati sayt GraphQL'idan olindi. [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home), [api-docs.didox.uz/graphql](https://api-docs.didox.uz/graphql)
- API **partner token** talab qiladi: "Чтобы использовать API необходимо получить партнерский токен". Token uchun Didox account manager'ga murojaat qilinadi (Telegram `https://t.me/Didox_account`, tel. +998 50 122 05 18). API o'zgarishlari kanali: `https://t.me/didoxapiupdates`. [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- URL'lar: test — `https://testapi3.didox.uz/`, prod (partner) — `https://api-partners.didox.uz/`. [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- Har bir so'rovda sarlavha: `Partner-Authorization: <PARTNER_TOKEN>`; kompaniyaga tegishli metodlarda qo'shimcha `user-key: <USER_TOKEN>`. [api-docs.didox.uz/ru/integrators-documents](https://api-docs.didox.uz/ru/integrators-documents)

**Token olish narxi/shartlari:** hujjatda ko'rsatilmagan — **TEKSHIRILMADI** (account manager bilan kelishiladi).

**Uchinchi tomon npm SDK** (rasmiy emas): `didox` v1.0.6, muallif Ahrorbek Mirzaev, MIT, repo `mirzaevoff/didox`. Prod URL'i `https://api-partners.didox.uz`. [npm package.json (jsDelivr)](https://cdn.jsdelivr.net/npm/didox@1.0.6/package.json), [SDK dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js)

Eslatmalar:
- Siz keltirgan `TBC_DIDOX_LOGIN` / `TBC_DIDOX_PASSWORD` / `TBC_DIDOX_PARTNER_TOKEN` env o'zgaruvchilari v1.0.6 paketining README va `dist/index.js` fayllarida **topilmadi**. SDK konfiguratsiya obyekti (`partnerToken`, `environment`) ishlatadi. Bu env nomlari boshqa versiyada/loyihada bo'lishi mumkin — **TEKSHIRILMADI**. [SDK README (jsDelivr)](https://cdn.jsdelivr.net/npm/didox@1.0.6/README.md)
- SDK'ning test URL'i `https://stage.goodsign.biz`, rasmiy hujjatda esa `https://testapi3.didox.uz/` — ikkalasi nomuvofiq. Ishonchli manba — rasmiy hujjat. [SDK dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js)
- SDK'da `createDraft()` faqat `POST /v1/documents/{docType}/create` ni chaqiradi, imzolash metodlari yo'q. [SDK dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js), [CHANGELOG](https://cdn.jsdelivr.net/npm/didox@1.0.6/CHANGELOG.md)
- **Tavsiya [XULOSA]:** SDK'ni bog'liqlik sifatida olmaslik; endpoint'lar sodda REST, rasmiy hujjat bo'yicha o'zimiz yozish ishonchliroq (SDK uchinchi tomon, 2026-yil yanvaridagi birinchi relizlar).

---

## 3. Savol 2 — Autentifikatsiya

**Topilma [TASDIQLANDI]** ([api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)):

Token uch usulda olinadi; hammasida `Partner-Authorization` sarlavhasi majburiy. Tokenlar UUID, **360 daqiqa** amal qiladi.

| Usul | Endpoint | Izoh |
|---|---|---|
| ERI (E-IMZO) | `POST /v1/auth/{taxId}/token/{locale}` | Body: `{"signature": "<timeStampTokenB64>"}`. ERI kalit kerak: INN base64'da imzolanadi, timestamp biriktiriladi |
| Parol | `POST /v1/auth/{taxId}/password/{locale}` | Body: `{"password": "..."}`. "Вход без ЭЦП (пароль задан при регистрации)". Javobda `token`, `taxId`, `name`, `related_companies`, `related_branches` |
| Kompaniyaga kirish | `POST /v1/auth/company/{companyTaxId}/login/{locale}` | Jismoniy shaxs o'z tokeni (`user-key` sarlavhasida) bilan kompaniyaga kiradi. Body ixtiyoriy: `branchNum`. Javob: `token` + `permissions: {tin, roles:[...]}` |

Muhim tafsilotlar:
- ERI orqali kirish **mijoz tomonidagi E-IMZO** bilan bog'liq: imzo `wss://127.0.0.1:64443/service/cryptapi` (lokal E-IMZO agenti) orqali yaratiladi, `pfx` plagin, `load_key` → `keyId`. Ya'ni server .pfx fayl va E-IMZO usiz bu usulni ishlata olmaydi. [api-docs.didox.uz/ru/integrators-eimzo](https://api-docs.didox.uz/ru/integrators-eimzo) **[XULOSA]** Bizga kerak emas — parol usulini ishlatamiz.
- **Parol bilan kirish brute-force himoyasi:** 3 noto'g'ri urinish/daqiqa → 10 daqiqa blok; 10 urinish → 24 soat; 25 urinish → akkaunt doimiy bloklanadi (HTTP 423/429). Bizning server noto'g'ri parol bilan qayta-qayta urinmasligi shart (retry siyosatida 422 "Incorrect login" da to'xtash). [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- SDK'da faqat parol (`loginLegalEntity`) va company-login endpoint'lari bor, ERI-token endpoint'i yo'q. [SDK dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js)
- Per-company "API key" tushunchasi hujjatda **yo'q**; yagona variantlar — parol yoki ERI. Token umri 6 soat, uzoq muddatli token yo'q → har ish oldidan (yoki 401 da) qayta login qilish kerak. **[XULOSA]**

**TEKSHIRILMADI:**
- Mijoz kompaniyalarida Didox parol bilan kirish **yoqilgan/o'rnatilganmi**. Hujjat: "пароль задан при регистрации". Faqat ERI bilan ro'yxatdan o'tgan akkauntda parol bo'lmasligi mumkin. Parol qanday o'rnatiladi/almashtiriladi (UI yoki `POST /v1/account/update`) — bu hujjatdagi "Аккаунт" bo'limida mavjud metod, lekin parol maydoni ishlatilishi tekshirilmadi. [api-docs.didox.uz/ru/integrators-account](https://api-docs.didox.uz/ru/integrators-account)
- Yuridik shaxs INN'i bilan parol login ishlashi hujjatdagi javob misoli (`name`, `taxId`) va SDK'dagi `loginLegalEntity` nomidan kelib chiqadi [XULOSA], lekin jonli sinov o'tkazilmagan.
- Parol usuli ERI ikki-faktorli himoyasiz ishlashi xavfsizlik nuqtai nazaridan mijoz uchun maqbulmi — biznes qarori.

---

## 4. Savol 3 — Qoralama yaratish (JSON tuzilmasi)

### 4.1. Endpoint [TASDIQLANDI]

([api-docs.didox.uz/ru/integrators-documents](https://api-docs.didox.uz/ru/integrators-documents))

- `POST /v1/documents/{docType}/create/{locale}` — "Создаёт документ в черновиках". `docType=002` — "Счёт-фактура без акта". `locale`: `ru` yoki `uz` (ixtiyoriy).
- Alohida "draft" endpoint kerak emas: **create o'zi qoralama yaratadi**, imzolash alohida `POST /v1/documents/{id}/sign` (biz chaqirmaymiz).
- Javob: `_id` (32 belgili hujjat ID), `created_date`, `pending_document.document_json` (tizim maydonlari to'ldirilgan JSON).
- Xatolar: 403 (shu doctype yaratishga vakolat yo'q), 422 (qo'llab-quvvatlanmaydigan tur va h.k.).
- Qoralamani yangilash: `POST /v1/documents/{id}/update/{docType}/{locale}` (faqat status 0 — "Черновик"); o'chirish: `POST /v1/documents/{id}/delete/draft` (imzosiz). Hujjatni o'qish: `GET /v1/documents/{id}?owner=1`. Ro'yxat: `GET /v2/documents?page&limit&doctype=002&status=0...`.
- Hujjat statuslari: 0 = Qoralama, 1 = Sherik imzosini kutmoqda, 3 = Imzolangan, 55 = Qoralama o'chirilgan va h.k. [api-docs.didox.uz/ru/integrators-catalogs](https://api-docs.didox.uz/ru/integrators-catalogs)
- Idempotentlik/dublikat tekshiruvi hujjatda yo'q — **TEKSHIRILMADI**. **[XULOSA]** Dublikatning oldini olish uchun o'z bazamizda (shartnoma × oy → Didox `_id`) saqlash va qayta yaratishdan oldin tekshirish kerak.

### 4.2. Request body — `002` JSON maydonlari [TASDIQLANDI]

Manba: [api-docs.didox.uz/ru/integrators-property-documents](https://api-docs.didox.uz/ru/integrators-property-documents) (bo'lim "1. Счёт фактура"). Quyida bizning holat uchun kerakli maydonlar (PascalCase so'rovda; javob/GET'da kichik harfda). Hujjatdagi belgilar: `*` — majburiy qator/obyekt, `**` — "muvaffaqiyatli yaratish uchun majburiy" maydon.

```jsonc
{
  "Version": 1,                     // *
  "WaybillLocalIds": [],
  "HasMarking": false,
  "HasRent": false,
  "FacturaRentDoc": null,           // ishlatilmasa null (bo'sh {} emas)
  "FacturaType": 0,                 // * 0 = "Стандартный"
  "ProductList": {                  // *
    "HasCommittent": false,
    "HasLgota": true,               // kamida bitta mahsulotda imtiyoz bo'lsa true
    "Tin": "<SELLER_TIN>",          // ** sotuvchi INN
    "HideReportCommittent": false,
    "HasExcise": false,
    "HasVat": true,
    "Products": [{                  // *
      "OrdNo": 1,                   // *
      "LgotaId": "<LGOTA_ID|null>", // imtiyoz kodi; ishlatilmasa null
      "CommittentName": "", "CommittentTin": "",
      "CommittentVatRegCode": "", "CommittentVatRegStatus": null,
      "Name": "<mahsulot nomi>",    // **
      "CatalogCode": "10401999001000000", // ** IKPU/MXIK
      "CatalogName": "<IKPU nomi>", // **
      "Marks": null, "Barcode": "",
      "PackageCode": "<PACKAGE_CODE>", // ** "xizmat (so'm)" paketi kodi
      "PackageName": "услуга (сум)",   // **
      "Count": 1,                   // * 6 xonagacha kasr
      "Summa": "<narx 2 xona>",     // * birlik narxi
      "DeliverySum": "<Count*Summa>", // **
      "VatRate": "0",               // *
      "VatSum": "0.00",             // *
      "ExciseRate": 0, "ExciseSum": 0,
      "DeliverySumWithVat": "<DeliverySum+VatSum>", // **
      "WithoutVat": true,           // * "Без НДС"; faqat HasVat=true da yuboriladi
      "LgotaType": 1,               // 1 = QQS imtiyozi, 2 = aylanma solig'i imtiyozi; LgotaId=null bo'lsa null
      "LgotaName": "<imtiyoz matni>",
      "LgotaVatSum": 0,             // QQS imtiyozi uchun hujjat: "12% от DeliverySum"; qiymat mantiqi TEKSHIRILMADI
      "WarehouseId": null,
      "Origin": 3                   // ** 3 = "Оказание услуг"
    }]
  },
  "FacturaDoc": { "FacturaNo": "...", "FacturaDate": "yyyy-MM-dd" },   // * ; ikkalasi **
  "ContractDoc": { "ContractNo": "...", "ContractDate": "yyyy-MM-dd" }, // * ; ikkalasi **
  "ContractId": null,               // my.soliq.uz'da ro'yxatdan o'tgan shartnoma ID'si
  "LotId": "",
  "OldFacturaDoc": null,            // FacturaType=0 da null
  "SellerTin": "<SELLER_TIN>",      // **
  "Seller": {                       // **
    "Name": "...", "BranchCode": "", "BranchName": "",
    "VatRegCode": "...",            // **
    "Account": "...",               // ** hisob raqam
    "BankId": "...",                // * MFO
    "Address": "...",               // **
    "Director": "...",              // ** majburiy
    "Accountant": "...",
    "VatRegStatus": 20              // **
  },
  "ItemReleasedDoc": null,
  "BuyerTin": "<BUYER_TIN>",        // **
  "Buyer": { /* Seller bilan bir xil tuzilma */ },
  "FacturaInvestmentObjectDoc": null,
  "FacturaEmpowermentDoc": null,
  "ForeignCompany": null
}
```

Hujjatdagi muhim qoidalar ("новые требования роуминга") [TASDIQLANDI]:
- Qabul qiluvchi tomon strukturani **qat'iy** tekshiradi: namunada yo'q maydonlarni (jumladan `WithoutExcise`, `Expansion`, `Id`, `MeasureId`, `SellerDepartmentId`, `BuyerDepartmentId`) yuborish **mumkin emas**.
- Ishlatilmaydigan obyektlar (`FacturaRentDoc`, `OldFacturaDoc`, `ItemReleasedDoc`, `FacturaInvestmentObjectDoc`, `FacturaEmpowermentDoc`, `ForeignCompany`) butunlay `null` bo'lishi kerak, bo'sh `{}` emas.
- Aniqlik: `Count` — 6 xonagacha; qolgan sonli maydonlar — 2 xonagacha; kasr ajratgich — nuqta, mingliklar ajratgichi yo'q.
- Sana formati faqat `yyyy-MM-dd`.
- `WithoutVat` faqat `ProductList.HasVat = true` bo'lganda yuboriladi.
- `Director` sotuvchi va xaridorda majburiy.
- Shartnoma bilan bog'lash: `ContractDoc.ContractNo/ContractDate` (matnli) va ixtiyoriy `ContractId` (my.soliq.uz ID); "Договор НК" bilan bog'lash uchun `didoxcontractid` xizmat maydoni.
- Bizning "xizmat (so'm)" paketi: hujjat misolida `PackageName: "услуга (сум)"`, kod `1209782` (IKPU ga bog'liq misol). Paketlar ro'yxati IKPU bo'yicha: `GET /v1/profile/{taxId}/productClasses/check/{code}/{lang}`. IKPU'ni profilga bog'lash: `POST /v1/profile/productClasses`; bog'langan IKPU va paketlar: `GET /v1/profile/productClassCodes` (javobda `packages[]` va `origin: {id:3, name:"Оказание услуг"}`). [api-docs.didox.uz/ru/integrators-profile](https://api-docs.didox.uz/ru/integrators-profile)

### 4.3. Kontragent/o'z ma'lumotlarini avtomatik to'ldirish [TASDIQLANDI]

- `GET /v1/utils/info/{TinOrPinfl}` — INN bo'yicha nom, manzil, MFO, hisob raqam, direktor, buxgalter, `VATRegCode`, `VATRegStatus`. Shu bilan `Seller`/`Buyer` bloklarini to'ldirsa bo'ladi. [api-docs.didox.uz/ru/integrators-utils](https://api-docs.didox.uz/ru/integrators-utils)
- `GET /v1/profile?isSeller=true` — joriy profil (sotuvchi) ma'lumotlari, `VATRegStatus` va h.k. [api-docs.didox.uz/ru/integrators-profile](https://api-docs.didox.uz/ru/integrators-profile)
- `GET /v1/profile/vatRegStatus/{taxId}?document_date=...&isSeller=...` — QQS reg. kodi va holati. [api-docs.didox.uz/ru/integrators-profile](https://api-docs.didox.uz/ru/integrators-profile)

### 4.4. `FacturaNo` / `FacturaDate` / `BuyerTin` bo'sh bo'lishi mumkinmi?

- Hujjatda bu maydonlar `**` ("обязательных к заполнению полей для успешного создания счет-фактуры") deb belgilangan. Ya'ni **hujjat bo'yicha majburiy**. [api-docs.didox.uz/ru/integrators-property-documents](https://api-docs.didox.uz/ru/integrators-property-documents)
- Didox UI'da bo'sh maydonlar bilan qoralama saqlash mumkin (siz bilgan fakt), ammo **API'da shunday bo'lishi hujjatda tasdiqlanmagan** — **TEKSHIRILMADI**. Sinash kerak: test muhitida `FacturaNo: ""`, `FacturaDate: ""` (yoki maydonsiz) bilan `create` chaqirish va 422 qaytishini tekshirish.
- **[XULOSA]** Agar API bo'sh qiymatni rad etsa, zaxira yo'llar: (a) vaqtinchalik placeholder yuborish (masalan, joriy sana va "DRAFT" raqami), buxgalter UI'da o'zgartiradi — lekin bu soliq hujjatiga noto'g'ri qiymat tushish xavfini tug'diradi, buxgalter albatta almashtirishi kerak; (b) Excel upload yo'li (6-bo'lim). Qaror sinovdan keyin.
- Qoralama yaratilgandan keyin buxgalter UI'da raqam/sanani to'ldirib imzolaydi; shuningdek biz `POST /v1/documents/{id}/update/002` bilan ham yangilashimiz mumkin (faqat status "Черновик" bo'lsa).
- `BuyerTin` bo'sh bo'lishi: UI'da mumkin; API'da `**` — **TEKSHIRILMADI**. Biz xaridor INN'ini aniq bilamiz (qarz shartnomasi tomoni), shuning uchun muammo emas.
- Imzolash vaqtida Didox JSON'ni NK (roaming) tizimiga yuboradi; `422 "Ошибка валидации"` imzolashda qaytishi mumkin [api-docs.didox.uz/ru/integrators-documents]. Ya'ni qoralamada nuqson bo'lsa ham u ko'pincha imzolashda aniqlanadi. **[XULOSA]**

---

## 5. Savol 4 — "Без НДС" va imtiyoz (lgota)

**Maydonlar [TASDIQLANDI]** ([api-docs.didox.uz/ru/integrators-property-documents](https://api-docs.didox.uz/ru/integrators-property-documents)):
- `ProductList.HasVat` (bizda `true`), `ProductList.HasLgota`.
- Mahsulot: `WithoutVat` (`true` = "Без НДС"; faqat `HasVat=true` da yuboriladi), `VatRate`, `VatSum`, `LgotaId` (imtiyoz kodi; ishlatilmasa `null`), `LgotaType` (1 = QQS imtiyozi, 2 = aylanma solig'i imtiyozi), `LgotaName` (imtiyoz matni), `LgotaVatSum` (QQS imtiyozi uchun hujjat izohi: "12% от DeliverySum"; aylanma solig'i uchun 0).
- Hujjat `WithoutVat=true` bilan `VatRate`/`VatSum`/`LgotaId` aniq kombinatsiyasini **misol bilan ko'rsatmaydi** (misolda `WithoutVat:false`, `VatRate:"0"`, `LgotaId:"100001"`). UI "Без НДС" tanlaganda `ҚҚС имтиёзи` kodini avtomatik qo'yishi sizning kuzatuvingiz. Shuning uchun aniq kombinatsiya — **TEKSHIRILMADI**; yechim: buxgalter UI'da "Без НДС" qoralamasini yaratadi → `GET /v1/documents/{id}?owner=1` → `data.json.productlist.products[0]` dan aniq qiymatlar olinadi.
- Hujjatdagi ro'yxat javobida `has_lgota`, `lgota_codes` maydonlari bor; `GET /v1/documents/{id}/privileges/{locale}` hujjatdagi qo'llangan imtiyozlar ro'yxatini qaytaradi (`lgota_code`, `lgota_name`, `product_name`). [api-docs.didox.uz/ru/integrators-documents](https://api-docs.didox.uz/ru/integrators-documents)

**Imtiyoz kodini qidirish endpoint'lari [TASDIQLANDI]** ([api-docs.didox.uz/ru/integrators-utils](https://api-docs.didox.uz/ru/integrators-utils)):
- `POST /v1/utils/product-privileges/:lang?checkDate=yyyy-MM-dd` — body: IKPU kodlari massivi; javob: har bir IKPU uchun `withoutVat[]` va `zeroVat[]` (har birida `lgotaId`, `lgotaName`), `notIncludedProduct`, `compensationWork`.
- `GET /v1/utils/without-vat-products/:lang` — QQS'siz mahsulot/xizmatlar ro'yxati (`catalogCode`, `newLgotaId`, `lgotaName`, `dateBegin`, `dateEnd`), `page`/`size` (max 1000).
- `POST /v1/utils/company-privileges/:lang?checkDate=` — QQS to'lovchi tashkilotlar uchun imtiyozlar.
- `GET /v1/utils/income-types/:lang`, `GET /v1/utils/other-income-product-classes/:lang` — daromad turlari (bizga bevosita tegishliligi **TEKSHIRILMADI**).

**Foiz daromadi uchun odatiy imtiyoz qiymati:**
- IKPU `10401999001000000` uchun aniq `lgotaId` hujjatlarda **keltirilmagan** — **TEKSHIRILMADI**. `product-privileges` endpoint'i bilan test muhitida/real tokenda so'rab olinadi.
- Huquqiy asos: NK 244-modda 7-band — pul shaklida kredit va qarz berish, jumladan ular bo'yicha foizlar QQS'dan ozod. [buxgalter.uz, 2023-08-08](https://buxgalter.uz/publish/doc/text192328_izmeneny_pravila_primeneniya_nekotoryh_lgot_po_nds)
- **Muhim ogohlantirish:** shu manbaga ko'ra (2023-yil avgust) bu imtiyoz IKPU kodiga **avtomatik bog'lanmaydi**; ariza my.soliq.uz shaxsiy kabinetida shartnoma ilova qilib berilishi kerak. Ya'ni IKPU `10401999001000000` uchun imtiyoz kodi tasnif.soliq.uz'da avtomatik chiqmasligi, `product-privileges` bo'sh `withoutVat` qaytarishi mumkin. 2023-yildan keyingi o'zgarishlar tekshirilmagan — **TEKSHIRILMADI** (mijoz soliq maslahatchisi bilan tasdiqlash). Umumiy tamoyil (IKPU kiritilsa imtiyoz kodi avtomatik biriktiriladi) ham shu muallifning boshqa maqolasida keltirilgan. [buxgalter.uz — Как применять льготы по ИКПУ](https://buxgalter.uz/publish/doc/text211030_kak_primenyat_lgoty_po_ikpu)
- Hujjatdagi `SingleSidedType = 5 ("Финансовые услуги")` — bu **bir tomonlama** ESF turi (xaridorsiz); bizning ikki tomonlama holatimizga taalluqli emas. [api-docs.didox.uz/ru/integrators-property-documents](https://api-docs.didox.uz/ru/integrators-property-documents) **[XULOSA]**

---

## 6. Savol 5 — Ko'p kompaniya (multi-company)

**Topilma [TASDIQLANDI]** ([api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)):
- Bitta partner token butun integratsiya uchun; kompaniya konteksti — `user-key` (har kompaniya uchun alohida token).
- Variant 1: har bir kompaniya INN'i + paroli bilan `POST /v1/auth/{companyTaxId}/password/{locale}` → shu kompaniya tokeni.
- Variant 2: jismoniy shaxs (PINFL) paroli bilan kirish → javobda `related_companies` (INN, nom, vakolat kodlari) → har kompaniya uchun `POST /v1/auth/company/{companyTaxId}/login/{locale}` → `permissions.roles` bilan kompaniya tokeni. Bir buxgalter bir nechta kompaniyada vakolatli bo'lsa, bitta parol hammasiga yetadi. **[XULOSA]**
- Filial: kompaniyaga kirishda body'da `branchNum` (ixtiyoriy). Filiallar ro'yxati: `GET /v1/profile/branches?tin=...`. Hujjatda `SellerBranchCode/BranchName` maydonlari ham bor.
- Vakolat: `create` 403 qaytaradi, agar foydalanuvchi shu turdagi hujjatni yaratishga vakolatsiz bo'lsa. `roles` kodlarining ma'nosi (11, 12, 21, ... ) hujjatda tushuntirilmagan — **TEKSHIRILMADI** (roles sozlash bo'limi: `GET/POST` "Настройка ролей" mavjud, tafsilot o'qilmadi).

---

## 7. Savol 6 — "Excel юклаш"

**Rasmiy ommaviy API hujjatlarida Excel import endpoint'i YO'Q** — 11 ta bo'lim ko'rib chiqildi, faqat IKPU kodlarini Excel'dan yuklash (`profile/productClasses/import`) UI'da bor. **[XULOSA]** Excel yo'li faqat Didox veb-ilovasi orqali (qo'lda).

**Didox veb-ilovasi (frontend bundle) dalillari** — bu **rasmiy hujjat emas**, faqat `https://didox.uz` saytining JS kodidan o'qilgan interfeys matnlari (yo'nalishni baholash uchun, ishonch past): [didox.uz/index_aff02a2b.js](https://didox.uz/index_aff02a2b.js)
- Sahifa "Импорт файлов Excel": kartochkalar — "Счета-фактуры", "Счета-фактуры (ускоренная загрузка)", "Счет-фактура с актом" (alohida), "ТТН (новый)", "Гибридная счет-фактура", "Произвольный документ" va h.k.; har birida "Шаблон" (shablon) va "Инструкция" havolalari bor.
- Import tugmalari: **"Добавить в черновик"** va "Загрузить и отправить" (ikkinchisida "Подписание" bosqichi bor, ya'ni imzo talab qiladi). Birinchisi qoralama yaratadi, deb talqin qilinadi **[XULOSA]**.
- "История импорта Excel" sahifasida "Подписанные" va "Черновики" tablari — import qilingan qoralamalar imzolanguncha "Черновики"da turadi ("Черновики появятся после импорта до момента подписания").
- Ichki (nohujjatlashtirilgan) endpoint nomlari frontend kodida: `POST documents/import/{type}`, `GET documents/import/{id}/state` — **partner API'ning bir qismi emas**, ishlatmaymiz.

**TEKSHIRILMADI:**
- "Счета-фактуры" shabloni aynan "Счет-фактура без акта" (`002`, "Стандарт") ekanligi — **XULOSA** (alohida "с актом" kartochkasi bor), tasdiqlanmagan.
- Shablon fayl URL'i va ustunlar ro'yxati — kodda to'g'ridan-to'g'ri `.xlsx` havolasi topilmadi (faqat IKPU shabloni `templates/ImportClassCodesTemplate.xlsx`). Shablonni Didox UI'dan ("Шаблон" tugmasi) yuklab olish kerak.
- Excel orqali bo'sh `FacturaNo`/sana bilan qoralama yaratish mumkinmi, "Без НДС"/imtiyoz ustunlari bormi.
- Excel faqat o'z kompaniyasi tokeni bilan (UI akkaunti) ishlaydi: har bir kompaniya uchun buxgalter alohida kirishi kerak, ommaviy avtomatlashtirish yo'q.

**[XULOSA] Excel yo'lining roli:** zaxira. Agar API bo'sh maydonli qoralamani rad etsa va placeholder qabul qilinmasa, ilova har kompaniya uchun `.xlsx` yaratadi, buxgalter Didox UI'da "Импорт Excel (ЭСФ)" → "Добавить в черновик" bilan yuklaydi.

---

## 8. Savol 7 — Rate limit va sandbox

- **Sandbox [TASDIQLANDI]:** test URL `https://testapi3.didox.uz/` (rasmiy hujjat). [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home) Test partner tokeni, test kompaniyalar va ularning parollari qanday olinishi hujjatda yo'q — **TEKSHIRILMADI** (account manager).
- Uchinchi tomon SDK boshqa stage URL'ini ko'rsatadi (`https://stage.goodsign.biz`) — nomuvofiqlik, ishonmaymiz. [SDK dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js)
- **Rate limit:** umumiy API so'rovlar limiti hujjatlarda ko'rsatilmagan — **TEKSHIRILMADI**. Faqat parol bilan login limiti hujjatlashtirilgan (3 urinish/daqiqa va h.k., 3-bo'limga qarang). Ro'yxat so'rovlarida `limit` 1–100.
- NK (soliq) tomonidagi nosozliklar: imzolashda 503 "Внешний сервис недоступен" va Didox UI'da "неполадки со стороны электронных сервисов НК" xabarlari bor — retry/backoff siyosati kerak. [api-docs.didox.uz/ru/integrators-documents](https://api-docs.didox.uz/ru/integrators-documents) **[XULOSA]**

---

## 9. TEKSHIRILMADI ro'yxati (test akkaunt yoki Didox support kerak)

| # | Masala | Qanday aniqlanadi |
|---|---|---|
| 1 | Partner token narxi/shartlari, test tokeni | Account manager |
| 2 | Har bir MCHJ'da parol bilan login mavjudmi; parolni qanday o'rnatish | Mijoz + test: `POST /v1/auth/{taxId}/password/ru` |
| 3 | Yuridik shaxs INN'i bilan parol login'i ishlaydi (hujjat misoli bor, jonli sinov yo'q) | Test |
| 4 | API'da bo'sh `FacturaNo`/`FacturaDate`/`BuyerTin` bilan qoralama yaratish | Test `create`; support'dan so'rash |
| 5 | `WithoutVat: true` + `HasVat`, `VatRate`, `VatSum`, `LgotaId/LgotaType/LgotaName/LgotaVatSum` aniq kombinatsiyasi | UI'da namunaviy qoralama → `GET /v1/documents/{id}?owner=1` |
| 6 | IKPU `10401999001000000` uchun `lgotaId` (foiz daromadi imtiyozi) va u avtomatik biriktirilishi | `POST /v1/utils/product-privileges/ru?checkDate=...`, tasnif.soliq.uz, soliq maslahatchi |
| 7 | 2023-yildan keyin St. 244/7 imtiyozi uchun my.soliq.uz arizasi talabi o'zgarganmi | Soliq maslahatchi / lex.uz |
| 8 | "xizmat (so'm)" `PackageCode` aniq qiymati va IKPU profilga bog'langan bo'lishi shartmi | `GET /v1/profile/productClassCodes`, `.../productClasses/check/{code}/{lang}` |
| 9 | Seller/Buyer: QQS to'lovchi bo'lmagan taraf uchun `VatRegCode`/`VatRegStatus` majburiyligi | Test |
| 10 | Qoralama yaratish uchun ofertaning imzolangan bo'lishi shartmi (imzolash uchun shart: ha) | Test; `integrators-newoffersign` bo'limi |
| 11 | Rate limit (login'dan tashqari) | Support |
| 12 | `permissions.roles` kodlarining ma'nosi, qaysi rol qoralama yarata oladi | Hujjat "Настройка ролей" + test |
| 13 | Dublikat himoyasi/idempotentlik (bir xil shartnoma × oy) | Test; o'z bazamizda nazorat |
| 14 | Excel shablon fayli, ustunlari, `002` ga mosligi, bo'sh maydonlar | Didox UI'dan shablonni yuklab olish |
| 15 | npm SDK'dagi `TBC_DIDOX_*` env nomlari manbasi | SDK muallifi/boshqa versiya |
| 16 | Didox hujjat o'zgarishlari (Telegram `didoxapiupdates`): hujjatda "yangi rouming talablari" — struktura tez-tez o'zgaradi | Kanalga obuna bo'lish |

---

## 10. Manbalar

Rasmiy Didox API hujjatlari (Wiki.js; sahifa matnlari HTML'dan o'qildi, sahifa ro'yxati GraphQL'dan):
- [api-docs.didox.uz — 03. Логин (home)](https://api-docs.didox.uz/ru/home) — partner token, test/prod URL, 3 xil token olish usuli, 360 daqiqa, parol brute-force limitlari
- [api-docs.didox.uz — 06. Документы](https://api-docs.didox.uz/ru/integrators-documents) — create/update/delete draft, sign, ro'yxat, GET hujjat
- [api-docs.didox.uz — 07. JSON документов](https://api-docs.didox.uz/ru/integrators-property-documents) — `002` JSON tuzilmasi, majburiy maydonlar, roaming talablari, SubTypes/SingleTypes/Origin/LgotaType kodlari
- [api-docs.didox.uz — 08. Утилиты](https://api-docs.didox.uz/ru/integrators-utils) — imtiyoz qidirish, `utils/info/{tin}`
- [api-docs.didox.uz — 05. Профиль](https://api-docs.didox.uz/ru/integrators-profile) — profil, filiallar, IKPU, paketlar, QQS reg. holati
- [api-docs.didox.uz — 09. Каталоги](https://api-docs.didox.uz/ru/integrators-catalogs) — o'lchov birliklari, hujjat statuslari
- [api-docs.didox.uz — 01. Работа с E-IMZO](https://api-docs.didox.uz/ru/integrators-eimzo) — lokal E-IMZO websocket orqali imzo
- [api-docs.didox.uz — 02. Регистрация](https://api-docs.didox.uz/ru/integrators-registration), [04. Аккаунт](https://api-docs.didox.uz/ru/integrators-account), [10. Шаблоны документов](https://api-docs.didox.uz/ru/integrators-document-template) (faqat shartnoma shablonlari, `007`)
- [api-docs.didox.uz/graphql](https://api-docs.didox.uz/graphql) — hujjat sahifalari ro'yxati

Uchinchi tomon SDK (rasmiy emas; endpoint shaklining ikkilamchi dalili):
- [npm: didox](https://npmjs.com/package/didox) (sahifa 403 qaytardi; mazmun jsDelivr orqali olindi)
- [package.json](https://cdn.jsdelivr.net/npm/didox@1.0.6/package.json), [README](https://cdn.jsdelivr.net/npm/didox@1.0.6/README.md), [CHANGELOG](https://cdn.jsdelivr.net/npm/didox@1.0.6/CHANGELOG.md), [dist/index.js](https://cdn.jsdelivr.net/npm/didox@1.0.6/dist/index.js)

Didox veb-ilovasi (rasmiy hujjat emas; Excel import interfeysi haqida past ishonchli dalil):
- [didox.uz](https://didox.uz) va uning JS bundle'i [index_aff02a2b.js](https://didox.uz/index_aff02a2b.js)

QQS imtiyozi (huquqiy kontekst, ikkilamchi manba):
- [buxgalter.uz — Изменены правила применения некоторых льгот по НДС (2023-08-08)](https://buxgalter.uz/publish/doc/text192328_izmeneny_pravila_primeneniya_nekotoryh_lgot_po_nds)
- [buxgalter.uz — Как применять льготы по ИКПУ](https://buxgalter.uz/publish/doc/text211030_kak_primenyat_lgoty_po_ikpu)

Qidiruvlarda (ingliz/rus/o'zbek) Didox Excel import yoki yordam markazi bo'yicha rasmiy ommaviy hujjat topilmadi (faqat YouTube darsliklar, mazmuni o'qilmadi): [youtube.com/watch?v=qjlb_ApcBfg](https://www.youtube.com/watch?v=qjlb_ApcBfg).
