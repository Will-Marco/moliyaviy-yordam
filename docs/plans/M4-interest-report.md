# M4 — Oylik foiz hisoboti (yadro) — reja

> Hajm: **complex**. Holat: reja (Sir tasdig'idan oldin). Manba: SRS §4 (CR-1…CR-10), FR-4.1–4.3, FR-2.3, FR-3.3.

## 1. Maqsad
Buxgalter shartnoma sahifasida har oy uchun foizni, qoldiqlarni va foiz qarzini ko'radi; oy ichidagi
bo'laklarni ochib tekshira oladi. Ro'yxatda "foiz qarzi" ustuni. Foiz to'lovi foiz qarzidan oshsa — ogohlantirish.

## 2. Hisoblash yadrosi — `apps/api/src/interest/engine.ts` (sof funksiya)

**Kirish:** `{ startDate, asOf, rates: [{ ratePercent, effectiveFrom }], operations: [{ date, type, amount }] }`
(`asOf` — "bugun", Clock'dan; yadro vaqtni o'zi bilmaydi — CONSTITUTION §9).

**Chiqish:** `months[]`, har biri:
`month (YYYY-MM)`, `from`/`to` (oy ichida hisoblangan birinchi/oxirgi kun), `rates[]` (oyda amal qilgan stavkalar),
`openingBalance`, `disbursed`, `repaid`, `closingBalance`, `interestExact` (ko'rsatish uchun 6 xona),
`interest` (tiyinga yaxlitlangan), `interestPaid`, `interestDebt` (yig'ma), `segments[]`,
`partial` (joriy oy, `asOf` gacha).
`segments[]`: `from`, `to`, `days`, `balance`, `ratePercent`, `yearDays`, `interestExact`.

**Algoritm (aniq, float'siz):**
1. Kunlik CR-1 o'rniga **bo'laklar**: chegara nuqtalari — operatsiya sanalari (keyingi kundan emas: CR-1 kun oxiri
   qoldig'i ⇒ operatsiya kuni yangi qoldiq bilan), stavka `effectiveFrom`, oy boshlari, yil boshlari (CR-2).
   Har bo'lakda qoldiq, stavka, yil kunlari o'zgarmas.
2. Pul — **BigInt tiyin**, stavka — **BigInt ×10⁴**. Oy ichida yil kunlari bitta, shuning uchun
   `oy foizi (tiyin) = Σ(qoldiq × stavka × kun) / (100 × 10⁴ × yilKunlari)` — **bitta bo'lish**, butun sonlar ustida.
   Oraliq yaxlitlash yo'q (CR-4).
3. Yaxlitlash: oy yakuni tiyinga, **half away from zero** (CR-4 "half-up"; manfiy foiz CR-10 uchun simmetrik).
4. Foiz faqat `startDate` dan (boshlang'ich stavka shu kundan). Boshlanishdan oldingi operatsiyalar qoldiqqa
   kiradi, lekin foiz `startDate` dan hisoblanadi.
5. Manfiy qoldiq → manfiy foiz (CR-10). Muddatdan keyin ham davom etadi (CR-6).
6. `interestDebt(oy) = Σ yaxlitlangan oylik foizlar (≤ oy) − Σ foiz to'lovlari (sana ≤ oy oxiri)` (CR-8).

**Hisobot oralig'i:** boshlanish oyidan **joriy oygacha** (joriy oy `partial`, `asOf` kunigacha). Muddat tugagan va
qoldiq 0 bo'lsa — qoldiq 0 bo'lgan oy yoki muddat oyi (qaysi keyin bo'lsa) gacha. Boshlanish kelajakda bo'lsa — bo'sh.

## 3. API
- `GET /api/contracts/:id/report` → `{ asOf, months[], totals: { interestAccrued, interestPaid, interestDebt } }`.
  Summalar string (CONSTITUTION §7). Ekran, Excel (M6), faktura (M7/M8) **shu** natijadan oladi (§11).
- Shartnoma view `totals` ga `interestDebt` qo'shiladi (FR-2.3 "foiz qarzi" ustuni).
- FR-3.3 (M3 dan): `INTEREST_PAYMENT` qo'shish/tahrirlashda `INTEREST_OVERPAID` ogohlantirishi —
  to'lov sanasigacha hisoblangan foiz (yaxlitlangan oylar + joriy oy to'lov kunigacha) − oldingi foiz to'lovlari.

## 4. Web
- Shartnoma sahifasida **"Oylik hisobot"** kartasi: Oy | Stavka | Oy boshidagi qoldiq | Berildi | Qaytarildi |
  Oy oxiridagi qoldiq | Hisoblangan foiz | To'langan foiz | Foiz qarzi. Joriy oy belgisi "dd.mm gacha".
- Qatorni ochish → bo'laklar: Davr | Qoldiq | Stavka | Kun | Foiz (6 xona) — tekshirish uchun (FR-4.2).
- Ro'yxat va shartnoma kartasida **Foiz qarzi**.

## 5. Testlar (TDD, yadro birinchi)
Yadro (golden): etalon yanvar **552 328,77** (aniq 552 328,767123…), fevral 45 mln × 28 kun = 483 287,67;
operatsiyasiz oy; kabisa yil (2028-02, 366); oy o'rtasidagi start; 1-sanadan stavka o'zgarishi (CR-5);
bir kunda bir nechta operatsiya (kun oxiri); manfiy qoldiq (CR-10); muddatdan keyin (CR-6); boshlanishdan
oldingi operatsiya; yaxlitlash chegarasi (0,5 tiyin → 1 tiyin, −0,5 → −1); foiz qarzi va to'lovlar.
API e2e: hisobot shakli, joriy oy `partial`, ro'yxatda foiz qarzi, `INTEREST_OVERPAID`.
Web: jadval, bo'laklarni ochish, formatlash.

## 6. Sir qarori kerak bo'lgan joylar
1. Joriy (tugallanmagan) oy hisobotda "bugungacha" ko'rsatilsinmi (taklif: ha, belgi bilan; faktura faqat tugagan oy uchun)?
2. `INTEREST_OVERPAID` asosi: to'lov sanasigacha hisoblangan foiz (joriy oyning qismini ham qo'shib)?
3. Boshlanishdan oldingi operatsiyalarga foiz `startDate` dan hisoblanadi — to'g'rimi?
4. Tugagan va to'liq yopilgan shartnoma hisoboti qayerda to'xtaydi (taklif: §2 "Hisobot oralig'i")?

## 7. Xavflar
- Prisma Decimal (decimal.js) 20 xonali aniqlik — yadro BigInt bilan bunga bog'liq emas.
- Ro'yxatda har shartnoma uchun yadro ishlaydi — yuzlab shartnoma × 19 oy uchun yetarli; keyinchalik kerak bo'lsa kesh.

---

## 8. Adversarial review'dan keyin (Sonnet, `M4-REVIEW.md`, verdict: APPROVE_WITH_CHANGES)
Matematika mustaqil tasdiqlandi (yanvar 552 328,77; fevral 2026 483 287,67; fevral 2028 499 180,33).
Qabul qilingan o'zgarishlar:

- **B1 → "bugungacha" yagona qoida:** yadro, hisobot, shartnoma jamilari va ro'yxat — hammasi `date ≤ asOf`
  operatsiyalardan. Kelajak sanali operatsiya saqlanadi (ogohlantirish `FUTURE_DATE`), jadvalda
  "rejalashtirilgan" belgisi bilan ko'rinadi, sanasi kelganda hisobga kiradi. Joriy oy: `from..asOf`,
  `partial: true`; oy ichidagi berildi/qaytarildi/to'langan foiz ham `asOf` gacha.
- **B2 → hisobot har doim boshlanish oyidan joriy oygacha** (qisqartirish qoidasi olib tashlandi).
- **M1 → BigInt tiyin** qaror sifatida: CONSTITUTION §7 va SRS §6 ga "decimal kutubxona **yoki** butun son
  (BigInt, tiyin)" deb yoziladi; Decimal → BigInt faqat `toFixed(2)` / `toFixed(4)` orqali, hech qachon `Number`.
- **M2 → `INTEREST_OVERPAID`:** `Warning.code` ga qo'shiladi; `OperationsService.load` stavkalarni ham o'qiydi;
  asos — to'lov sanasigacha hisoblangan foiz (tugagan oylar yaxlitlangan + to'lov oyi to'lov kunigacha,
  yaxlitlangan) − sanasi ≤ to'lov sanasi bo'lgan **boshqa** foiz to'lovlari. Qabul qilingan ogohlantirish
  o'zgarmagan tahrirda qaytarilmaydi (M3 qoidasi).
- **M3 → ikki raqam:** ro'yxat va kartadagi **"Foiz qarzi"** — tugagan oylar bo'yicha (faktura bilan bir xil);
  shartnoma sahifasida qo'shimcha **"Bugungacha hisoblangan"** (joriy oy qismi bilan).
- **M4 → testlar:** mustaqil **kunma-kun oracle** (oddiy, sekin, Decimal'siz BigInt) + tasodifiy
  property-test (yil/kabisa chegaralari, manfiy qoldiq, stavka o'zgarishlari) — segment yadrosi bilan tiyinigacha
  teng. CR-3 va CR-9 uchun alohida testlar (CONSTITUTION §10). Oraliq yaxlitlashni ushlaydigan holat.
- **M5 → stavkalar kirishi:** `rates` `effectiveFrom`, keyin `createdAt` bo'yicha tartiblangan holda beriladi
  (shartnoma); bir xil sanada oxirgisi g'olib — test bilan. Oy o'rtasidagi `effectiveFrom` (boshlang'ich stavka,
  start oy o'rtasida) — test. M5 hali yo'q: e2e fixture `rate_changes` ga to'g'ridan-to'g'ri yozadi.
- **Minor:** `opening + disbursed − repaid = closing` ayniyati (start oldidagi operatsiyalar birinchi oy
  `openingBalance` ida); yaxlitlash — **half away from zero**, SRS CR-4 ga yoziladi, BigInt'da `|n|` bilan;
  `interestExact` oy surat/maxrajidan (segmentlar yig'indisidan emas), 6 xona round; kunlar inklyuziv, UTC;
  yadro xatosi ro'yxatni sindirmasin (defensiv); chekka holatlar: `asOf < start`, `asOf = start`, start oy oxirida,
  qoldiq 0 bo'lib keyin qayta berilgan.
