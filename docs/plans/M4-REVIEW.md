# Review: M4 — Oylik foiz hisoboti (yadro) — 2026-10-07
Verdict: APPROVE_WITH_CHANGES

Reja fayli: `docs/plans/M4-interest-report.md`. Tekshirilgan: SRS §4/§5 (CR-1…CR-10, FR-3.3, FR-4.x), CONSTITUTION, PROGRESS,
`ledger.ts`, `contract.view.ts`, `contracts.service.ts`, `operations.service.ts`, `common/*`, `schema.prisma`.

Qisqa xulosa: hisoblash yadrosining **matematikasi to'g'ri** (CR-1/CR-2/CR-4 talqini, BigInt yondashuvi, etalon). Muammolar
yadroning **kirish/chiqish shartnomasida** (`asOf` va kelajak sanali operatsiyalar, hisobot oralig'i) hamda
`INTEREST_OVERPAID` ning mavjud M3 kodiga qanday ulanishida. Schema o'zgarmaydi — data migratsiyasi xavfi yo'q.

---

## Men o'zim hisoblagan etalon (BigInt skript bilan tekshirildi)

Birliklar: tiyin, stavka ×10⁴ (14% → 140 000), maxraj `100 × 10⁴ × 365 = 365 000 000`.

| Hisob | Surat | Aniq tiyin | Yaxlitlangan | So'm |
|---|---|---|---|---|
| Yanvar: 60 mln × 15 kun (5–19) + 45 mln × 12 kun (20–31) | 6e9·140000·15 + 4.5e9·140000·12 = **20 160 000 000 000 000** | 55 232 876,7123… | 55 232 877 | **552 328,77** ✔ |
| Fevral 2026: 45 mln × 28 | 4.5e9·140000·28 = 17 640 000 000 000 000 | 48 328 767,1233… | 48 328 767 | **483 287,67** ✔ |
| Fevral 2028 (366): 45 mln × 29 | — | 49 918 032,787… | 49 918 033 | 499 180,33 |

Qo'shimcha kuzatuvlar:
- Yanvar suratining qiymati 2,016·10¹⁶ > 2⁵³ (9,007·10¹⁵). Ya'ni `Number` bilan bu etalon **jim noto'g'ri** bo'lardi — BigInt tanlovi
  asosli, buni testda alohida ko'rsatish kerak (qarang Minor-3).
- Kunlik yaxlitlash (`Math.round` har kun) 55 232 874 tiyin beradi (3 tiyin xato), segment-bo'yicha yaxlitlash esa tasodifan
  55 232 877 beradi. Ya'ni etalon **oraliq yaxlitlashni yaxshi ushlamaydi** — golden test faqat shu bilan cheklanmasligi kerak
  (qarang Major-4: mustaqil oracle).
- SRS «12 kun (20–31)» to'g'ri; reja ham shu.

---

## Blocker

### B1. `asOf` va kelajak sanali operatsiyalar semantikasi yo'q — raqamlar uch joyda bir-biriga zid bo'ladi
Reja yadroga `asOf` beradi, lekin `operations[].date > asOf` bo'lsa nima qilishini aytmaydi. Hozirgi kodda
`toContractView` → `ledgerTotals(record.operations)` **barcha** operatsiyalarni (kelajaktagilarni ham) sanaydi
(`principalBalance`, `interestPaid`).
Failure scenario: bugun 07.10.2026; buxgalter 15.11.2026 sanali `PRINCIPAL_REPAYMENT` (yoki 20.10 dagi `INTEREST_PAYMENT`)
kiritdi (kelajak sanali operatsiya M3 da bloklanmagan). Natija:
- ro'yxatda «asosiy qarz qoldig'i» = kelajak qaytarishdan keyingi qoldiq (ledgerTotals), hisobotning joriy oy `closingBalance` i = `asOf` dagi qoldiq → ikki xil raqam (CONSTITUTION §11 ruhi buzildi);
- `interestPaid` (view) ≠ `interestPaid` (report totals) agar report faqat `≤ asOf` ni olsa;
- joriy oy `disbursed`/`repaid` — oyning to'liq yig'indisimi yoki `asOf` gachami — aniqlanmagan; `opening + disbursed − repaid = closing` ayniyati sinishi mumkin.
→ Nima qilish: rejaga aniq qoida yozing: (a) yadro `date > asOf` operatsiyalarni **chetga qo'yadi** (qoldiq ham, to'lov ham, foiz ham), yoki hammasini hisobga oladi — lekin bitta qoida; (b) joriy oy ustunlari (`disbursed`, `repaid`, `interestPaid`, `closingBalance`) `asOf` gacha (inklyuziv); (c) `partial = asOf < oy oxiri` (asOf = oyning oxirgi kuni bo'lsa ham kun hali tugamagan — faktura uchun `asOf > oy oxiri` sharti, M7 shu bayroqqa tayanadi); (d) `toContractView` dagi `principalBalance`/`interestPaid` bilan hisobot totals ni bir xil qoidaga keltirish yoki farq ataylab ekanini hujjatlash.

### B2. «Hisobot oralig'i» qoidasi noto'g'ri hisobotga olib keladi (yopilgandan keyin qayta berilsa va to'lovlar oxirgi qatordan keyin tushsa)
Reja: «Muddat tugagan va qoldiq 0 bo'lsa — qoldiq 0 bo'lgan oy yoki muddat oyi (qaysi keyin bo'lsa) gacha.» Muammolar:
1. «Qoldiq 0 bo'lgan oy» — birinchi nolga tushgan oymi yoki oxirgisimi? Failure: muddat 2026-12 da tugagan; qarz 2027-02 da 0 bo'ldi, 2027-06 da yana pul berildi (M3 muddatdan keyingi `berildi` ni ogohlantirish bilan ruxsat qiladi). «Birinchi nol oy» deb olinsa — iyun foizi hisobotda va ro'yxatdagi foiz qarzida **umuman yo'q**; faktura (M7) hech qachon chiqmaydi. Oy-bo'yicha foiz yo'qolishi — bu loyihaning eng og'ir xatosi turi.
2. Oxirgi ko'rsatilgan oydan **keyin** tushgan foiz to'lovlari (yopilgandan 2 oy keyin qarz to'langan — odatiy holat) hech qaysi qatorda ko'rinmaydi; `interestDebt` (ro'yxat ustuni) eski, katta qarzni ko'rsatib turaveradi. Reja «Σ foiz to'lovlari (sana ≤ oy oxiri)» deydi — oxirgi qatordan keyingi to'lovlar tashlab yuboriladi.
3. Qoldiq **manfiy** bo'lib qolsa (CR-10) «0 bo'lguncha» hech qachon yetilmaydi — qoida joriy oygacha davom etishi kerak; reja buni aytmaydi.
→ Nima qilish: oraliq oxiri = `min(joriy oy, max(muddat oyi, oxirgi oy, unda qoldiq ≠ 0 bo'lgan kun yoki biror operatsiya bor))`; oxirgi qatordan keyingi barcha ≤ `asOf` to'lovlar oxirgi qatorning `interestPaid`/`interestDebt` iga kiritilsin (yoki oraliq har doim oxirgi operatsiya oyini ham qamrasin). Eng oddiy va xavfsiz variant: **har doim joriy oygacha**, yopilgan shartnomada nol qatorlar ko'rinaversin (FR-4.1 «joriy oygacha» deydi; qisqartirish SRS dan chetga chiqish va xavf). Agar qisqartirish saqlansa — SRS ga yozing (CONSTITUTION §8) va yuqoridagi 3 stsenariy uchun test qo'shing.

---

## Major

### M1. CONSTITUTION §7 / SRS §6 «kodda decimal kutubxona» — reja BigInt tanlaydi, lekin buni qaror sifatida qayd etmaydi
§7: «DB'da `Decimal`, kodda decimal kutubxona». SRS NFR: aynan shu. Reja BigInt/butun son ishlatadi (texnik jihatdan **kuchliroq**: decimal.js 20 xonali aniqlik bilan bo'lishda yaxlitlaydi, BigInt esa bitta aniq bo'lish). Lekin literal talqinda bu qoidaga zid, konstitutsiyani o'zgartirish faqat Sir ruxsati bilan.
→ §6 «Sir qarori» ga 5-band qo'shing: «yadroda BigInt tiyin/stavka×10⁴ (decimal kutubxona o'rniga) — sabab: bitta aniq bo'lish, oraliq yaxlitlash yo'q»; tasdiqdan keyin SRS §6 va CONSTITUTION §7 formulasi «float/number emas; decimal kutubxona **yoki** BigInt» ga yangilansin, PROGRESS qaror jurnaliga yozilsin.

### M2. `INTEREST_OVERPAID` mavjud M3 arxitekturasiga qanday ulanishi aytilmagan — hozirgi kod buni ko'tarmaydi
Haqiqiy kod: `ledger.ts` `Warning.code` — yopiq union (4 ta kod), `operationWarnings` sof va foiz/stavka/Clock'ni bilmaydi; `OperationsService.load()` faqat `limitAmount/startDate/endDate/operations` ni tanlaydi (`rateChanges` yo'q), `Clock` inject qilinmagan. Reja shuni «FR-3.3 (M3 dan)» deb bir qatorda o'tadi. Ochiq masalalar:
- «oldingi foiz to'lovlari» — sana bo'yicha (`date ≤ candidate.date`) yoki kiritish tartibi bo'yichami? Failure: 10.01 va 20.02 da to'lov bor; 15.01 dagi to'lovni tahrirlab katta qildik. «Hammasi minus o'zi» desak — 20.02 dagi kelajak to'lov hisobga olinib, noto'g'ri ogohlantirish yoki ogohlantirishsizlik chiqadi. Qoida: faqat `date ≤ candidate.date` (bir kunda — createdAt tartibi), o'zi chiqarib tashlanadi (edit).
- M3 qoidasi: «qabul qilingan ogohlantirish o'zgarmagan tahrirda qaytarilmaydi» (before/after solishtirish). `OVERPAID` uchun «qanchaga oshgani» (overpay miqdori) before/after solishtirilishi kerak; aks holda izoh yoki sanani tahrirlashda har safar 409 chiqadi.
- Boshqa operatsiya (berildi/qaytarildi) o'zgarsa yoki o'chirilsa o'tgan to'lovlar «ortiqcha» bo'lib qolishi mumkin — ogohlantirish faqat foiz-to'lov saqlashda chiqadi (maqsadga muvofiq, lekin rejada aytilsin).
- `asOf` = `candidate.date` bo'lishi kerak (kelajak sanali to'lov uchun ham hisoblash `asOf=Clock.today()` bilan emas, to'lov sanasi bilan) — rejada «joriy oy to'lov kunigacha» deyilgan, lekin yadro interfeysi (`asOf` + B1 qoidasi) bilan bir-biriga mos kelishi kerak: B1 da kelajak operatsiyalar chetga qo'yilsa, to'lov sanasi ham `asOf` dan keyin bo'lganda hisob qanday?
→ Nima qilish: reja bo'limiga `OperationsService.check` o'zgarishini yozing: `rateChanges` + `Clock` qo'shiladi, `Warning.code` ga `'INTEREST_OVERPAID'`, yangi sof funksiya `interestOverpaid(contractTerms, rates, operationsAfter, candidate)` (engine chaqiradi, `asOf = candidate.date`), web'dagi ogohlantirish xaritasi (M3 formasi) ham yangilanadi (reja Web bo'limida yo'q).

### M3. Ro'yxat «foiz qarzi» joriy (tugallanmagan) oyni o'z ichiga oladi — CR-8 va faktura bilan farq qiladi
Reja: `interestDebt` — joriy oy `asOf` gacha yaxlitlanib kiradi, va bu qiymat `totals.interestDebt` va ro'yxat ustuniga chiqadi. CR-8: «Σ oy foizlari (yaxlitlangan) − Σ to'lovlar». Faktura (M7) esa faqat tugagan oy uchun. Failure: 10.10 da ro'yxat 3 oy fakturasi + 9 kunlik foiz yig'indisini «qarz» deb ko'rsatadi; buxgalter Didox'da chiqarilgan fakturalar yig'indisi bilan solishtirsa mos kelmaydi; 11.10 da raqam o'zgaradi (partial qayta yaxlitlanadi). Q1 faqat hisobotdagi «bugungacha» qatori haqida so'raydi, ro'yxat ustuni haqida emas.
→ Nima qilish: `interestDebt` ni ikkiga bo'ling: `interestDebt` (faqat tugagan oylar − to'lovlar; CR-8 ga 1:1 mos, faktura bilan mos) va ixtiyoriy `accruedToDate`. Ro'yxat ustuni — birinchisi (yoki Sir qaroriga qo'shing: Q1 ga ro'yxatni ham kiriting).

### M4. Golden testlar yetarli emas — mustaqil oracle yo'q; CR-3 va CR-9 testlari ro'yxatda yo'q
CONSTITUTION §10: «har CR kamida bitta test». Reja ro'yxatida: CR-3 (oddiy foiz: to'lanmagan foiz kapitallashmaydi) — yo'q; CR-9 (o'tgan sanaga operatsiya qo'shilsa hisob yangilanadi — API e2e) — yo'q; CR-7 M3 da. Segment algoritmi — aynan off-by-one xavfi bo'lgan joy, golden misollar 2–3 ta qo'lda hisoblangan raqam — kam.
→ Nima qilish: (1) **naive reference** — kun-kun aylanadigan (har kun uchun surat/maxraj kasr sifatida BigInt, oxirida bitta bo'lish) sekin yadro va randomized (property) test: tasodifiy operatsiyalar/stavkalar/startlar, yil chegarasi va kabisa yilni qamrab, segment yadro bilan naive natijasi **bir xil** bo'lsin. Bu 30 qator, lekin barcha off-by-one xatolarini ushlaydi. (2) CR-3 va CR-9 testlarini ro'yxatga qo'shing.

### M5. Stavka tengligi (CR-5 oxirgi band) uchun kirish shartnomasi va test yo'q; «oy o'rtasida stavka o'zgarishi» acceptance
SRS: «Bir xil `amal qilish sanasi` ga bir nechta o'zgarish bo'lsa — oxirgi kiritilgani amal qiladi.» Yadro kirishi `rates: [{ratePercent, effectiveFrom}]` — `createdAt` yo'q; to'g'ri natija faqat massiv tartibiga (`contractInclude`: `effectiveFrom asc, createdAt asc`) tayanadi. Reja bu shartnomani yozmaydi va test ro'yxatida yo'q. Failure: kimdir massivni qayta saralasa (yoki M7/M8 boshqa `include` ishlatsa) — noto'g'ri stavka jim qo'llanadi.
Shuningdek: SRS FR-4 acceptance «oy o'rtasida stavka o'zgarishi» deydi, lekin reja testi faqat «1-sanadan stavka o'zgarishi». CR-5 effectiveFrom ni M5 hisoblaydi (hali yo'q), shuning uchun yadro **ixtiyoriy** `effectiveFrom` (oy o'rtasi ham) bilan to'g'ri segmentlashi va buning testi kerak (segment bo'linishi, ikkala stavka bir oyda — `rates[]` ikki element).
→ Nima qilish: yadro doc/type'da «bir xil `effectiveFrom` da massivdagi **oxirgi** yutadi» deb belgilansin va test qo'shilsin; mid-month `effectiveFrom` testi qo'shilsin; birinchi stavkadan oldingi kunlar uchun (agar `effectiveFrom > startDate` bo'lsa) qoida: `rates[0]` (mavjud `currentRate()` shunday qiladi).

---

## Minor

1. **Pre-start operatsiyalar va qator ayniyati.** Reja: boshlanishdan oldingi operatsiyalar qoldiqqa kiradi. Birinchi oy qatorida `openingBalance` ularni o'z ichiga oladimi, `disbursed`/`repaid` oy ichidagilarnigina sanaydimi — aniq yozing (`opening + disbursed − repaid = closing` ayniyati; start oy o'rtasida bo'lsa ham). Startdan oldingi `INTEREST_PAYMENT` birinchi qatorda manfiy `interestDebt` beradi — normal, lekin test qiling.
2. **Yaxlitlash talqini SRS da yozilmagan.** SRS: «half-up»; manfiy (CR-10) uchun reja «half away from zero» tanlaydi (decimal.js `ROUND_HALF_UP` ham shunday). Matematik «half-up» (∞ tomon) −0,5 → 0 berardi. Talqin to'g'ri va test bor (−0,5→−1), lekin CONSTITUTION §8 bo'yicha avval SRS CR-4 ga bir jumla qo'shing. BigInt bo'lishi `/` nolga qarab kesadi — implementatsiyada `|n|` bilan ishlang (ikkilik qoldiq `2r ≥ d`), test: `−1/2`, `−55 232 876,5…` va aralash ishorali oy (oyning bir qismida manfiy, bir qismida musbat qoldiq — yig'indi bitta bo'lish bilan, ishorali).
3. **Test «number'ga tushib qolmasin».** Etalon surati 2,016·10¹⁶ > 2⁵³. Testga: «surat `Number.MAX_SAFE_INTEGER` dan katta bo'lgan holat»; `Decimal → BigInt` konvertatsiyasi `toFixed(2)`/`toFixed(4)` orqali (rejadagi `rateString` `toString()` ishlatadi — eksponensial yozuv xavfi; yadroda `toFixed(4)`), hech qachon `Number()`.
4. **Ortiqcha / noaniq:** («yil boshlari» chegara nuqtasi oy boshlari bilan bir xil — alohida ro'yxatlash keraksiz, faqat chalg'itadi); «`interestExact` 6 xona» — qanday kesiladi (round yoki truncate) yozilmagan; segment yig'indisi oyning `interestExact` iga teng bo'lmasligi mumkin (har biri alohida 6 xonaga) — UI/Excel (M6) da tushuntirish yoki oy `interestExact` ni segment ko'rsatkichlari yig'indisidan emas, surat/maxrajdan chiqaring.
5. **Kunlar sonini hisoblash:** `to − from + 1` (inklyuziv) va UTC (`Date.UTC`) bo'yicha — server TZ ga bog'liq emas (`dates.ts` shu uslubda). Rejada «`from`/`to` — oy ichida hisoblangan birinchi/oxirgi kun» deyilgan; segment `to` ham inklyuzivligini yozing (off-by-one manbai).
6. **Dependency:** M4 e2e/acceptance uchun CR-5 `effectiveFrom` ni hisoblaydigan M5 hali yo'q — test fixture'lari `rate_changes` ga to'g'ridan-to'g'ri yozadi. Buni rejaga qo'shing (aks holda «stavka o'zgarishi» e2e yozib bo'lmaydi).
7. **`toContractView` sinxron, sof va har joyda (list/create/update) chaqiriladi.** Unga yadro qo'shilsa, yadro xatosi (bo'sh `rates`, buzilgan ma'lumot) ro'yxat va create/update javobini ham sindiradi. Defensiv: `rates` bo'sh bo'lsa aniq xato/`null` `interestDebt`; hisobot endpoint'i 404 (shartnoma yo'q) va autentifikatsiya global guard orqali (tekshirib, e2e'da «login'siz 401» qo'shing).
8. **Hisobot oralig'i chekka holatlari testga:** `asOf < startDate` (bo'sh), `asOf == startDate` (1 kun), start oyning oxirgi kunida, `endDate` oy o'rtasida, qoldiq hech qachon 0 emas, qoldiq oy oxirida 0 va keyingi oyda qayta berildi.

---

## Tekshirilgan va yaxshi
- **CR-1:** «operatsiya kuni yangi qoldiq bilan» — to'g'ri: chegara nuqtasi operatsiya sanasining o'zi, segment shu kundan boshlanadi (berilgan kun hisobga kiradi; qaytarilgan kun kamaygan qoldiq bilan). Bir kundagi bir nechta operatsiya — kun oxiri sof natija, tartib ahamiyatsiz.
- **CR-2:** oylar yil chegarasini kesmaydi, shuning uchun bir oyda `yearDays` bitta; oy yakuni bitta bo'lish to'g'ri. Dekabr 2027 (365) va fevral 2028 (366) alohida oylarda.
- **CR-4:** oraliq yaxlitlashsiz, oy yakunida bitta yaxlitlash; etalon 552 328,77 va fevral 483 287,67 — **men mustaqil tasdiqladim** (yuqoridagi jadval).
- **CR-6 / CR-10:** muddatdan keyin ham foiz davom etadi, endDate yadroga faqat oraliq uchun kerak; manfiy qoldiq → manfiy foiz, ishorali yig'indi bitta bo'lish bilan.
- **CR-8** formulasi (yaxlitlangan oylar − to'lovlar) SRS ga 1:1 mos.
- **Konstitution §9/§11:** `asOf` parametr, yadro vaqtni bilmaydi; ekran/Excel/faktura bitta natijadan.
- **Schema o'zgarmaydi** → migratsiya yo'q, ma'lumot xavfi yo'q. `rate_changes.effectiveFrom` va `operations` allaqachon yetarli.
- **Hajm/vertical slice:** hisobot yadrosi → API → shartnoma sahifasi bitta user-visible harakat; kunma-kun emas, segment-asosli → < 1 s NFR ga ishonchli. `Decimal(18,2)` va `Decimal(7,4)` (stavka 4 xonagacha) ×10⁴ butun songa **aniq** tushadi.
- Over-engineering yo'q (kesh kerak emas deb to'g'ri qoldirilgan).

## Ochiq savol (Sir / reja muallifi uchun)
1. Kelajak sanali operatsiyalar (`date > bugun`) hisobda ishtirok etsinmi (B1)? Eng xavfsizi — M3 da ularni ogohlantirish bilan ham chiqarish yoki yadroda chetga qo'yish.
2. Yopilgan shartnoma hisoboti qisqarsinmi yoki har doim joriy oygacha (B2)? Taklif: har doim joriy oygacha.
3. Ro'yxatdagi «foiz qarzi» — tugagan oylarmi yoki joriy oy bugungacha ham (M3)?
4. §6 Q3 (boshlanishdan oldingi operatsiyalar foizi `startDate` dan) — algoritm §2.4 allaqachon shuni qaror qilib qo'yibdi; savol sifatida qoldirsangiz algoritm bandini «taxmin» deb belgilang.
5. BigInt vs «decimal kutubxona» (M1) — konstitutsiya formulasi yangilansinmi?
