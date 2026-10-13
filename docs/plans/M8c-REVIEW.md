# Review: M8c — Didox qoralama yaratish (forma roboti) — 2026-10-13

Verdict: **APPROVE_WITH_CHANGES** (4 blocker: M8c kodi/spike'dan oldin rejaga v5 sifatida kiritilishi shart)

Reviewer: Sonnet (boshqa model, adversarial). Reja: `docs/plans/M8-didox-drafts.md` (v1 tana + v2/v3/v4 qo'shimchalar).

Yo'nalish to'g'ri: Page abstraksiyasi + locators bir joyda, firma-stop, write-ahead + karantin g'oyasi, API'da `expectedAmount`/
`source`/`DRAFT_CHANGED` allaqachon qurilgan, sign/send uch qavatli to'siq (FORBIDDEN_LABEL, `clickScript` ichida tekshiruv,
`net-policy` segment bloki). Muammo — **reja matni** (qurish qo'llanmasi sifatida) o'zi bilan va qurilgan kod bilan to'qnashadi;
builder 0–13 qadamni so'zma-so'z bajarsa, v2 da rad etilgan xavfli xulqni qayta quradi.

O'qildi: reja (to'liq), SRS Modul 8 + §9.1/9.2, CONSTITUTION §7–16, `didox-flow.md`, PROGRESS (qaror jurnali), `apps/desktop/src/{main.ts,
bridge/ipc.ts,didox/{run,contract,driver,locators,view,page-scripts,net-policy,testing/fake-page}.ts,didox/steps/{login,logout}.ts,
secrets/eri-store.ts}`, `apps/api/src/invoices/{controller,service,invoice.ts,dto}`, migratsiya `20261012100000`,
`apps/desktop/package.json`. **Real Didox'ga tegilmadi** — DOM/xulq haqidagi hamma gap spike'ga yuboriladi.

---

## Blocker

### B1. Reja matni o'ziga zid: 0–13 qadam (v1) vs v2 vs qurilgan API vs v3/v4 — builder noto'g'ri narsani quradi
Aniq to'qnashuvlar (har biri qurishda jiddiy xatoga olib keladi):
1. **Qadam 0 va 12 (v1 matni) = v2/B1 rad etgan xulq.** 0-qadam "shartnoma № + ҚҚСсиз summa mos bo'lsa → ID, `already`" — aynan
   31 kunlik oylarda jim noto'g'ri-ID beradigan variant. B1 uni toraytirgan, lekin qadam matni o'zgarmagan; 12-qadam hamon
   "eng yangi mos qator". Yagona manba kerak.
2. **Qadam 13 PUT `{didoxDocumentId, source:'didox'}` — `expectedAmount`siz.** Qurilgan DTO (`MarkDraftDto`):
   `source==='didox'` bo'lsa `expectedAmount` va 32-hex ID **majburiy** (`@ValidateIf … @IsMoney`) → har PUT 400 bo'ladi.
   Reja M6 da `expectedAmount`ni eslaydi, lekin qadam/IPC/TDD matnida yo'q.
3. **`didox_runs`:** "API o'zgarishlari" §2, "Fayl tuzilmasi" (`api/client.ts … didox-runs`), "Web" (`useDidoxRuns`), "M8c TDD tartibi"
   ("API `source` + `didox_runs` (e2e)") hamon API jadvalini nazarda tutadi; v2 oxirida "API'da emas, `userData/didox-runs/*.json`"
   deyilgan. `source` API qismi qurilgan; `didox_runs` API'si **qurilmasligi** kerak, TDD ro'yxatidan o'chirilsin.
4. **B2 vs qurilgan API (RACE).** v2/B2: "ID'siz qo'lda belgi ustiga ID biriktirish `confirmWarnings`siz ruxsat". Qurilgan
   `markDraft`: `existing && !confirmWarnings` → 409 `CONFIRMATION_REQUIRED` + `POSSIBLE_DUPLICATE`. Reja "tekshirilgan fakt" #4
   ("avtomatika hech qachon `confirmWarnings:true` yubormaydi") ham shu. Reja matni qurilgandan eskirgan; qaysi biri to'g'ri ekani
   (qurilgan — to'g'ri, buxgalter tasdig'i kerak) rejaga yozilsin.
5. **v3 "M8d: 06:00 da avtomatik kirish yo'q → bildirishnoma, buxgalter parolni o'zi kiritadi" matni hamon faylda**; v4 faqat
   "v2 doirasi qaytarildi" deydi, M8d/Tartib/spike "1–6" satrlarini aniq bekor qilmaydi. "Status: reja v2" sarlavhasi ham eski.
   Eng muhimi: **FR-8.4 forma roboti qayta tiklangani (Sir, 2026-10-12/13) rejada yozilmagan** — faqat PROGRESS jurnalida (65-qator
   "Claude qurmaydi" va 53-qator "bekor" ketma-ket turibdi). Reja — builder o'qiydigan yagona artefakt.
6. IPC yuzasi (§"IPC yuzasi") `didox:list-runs`, karantinni hal qilish (`Belgilash` / `Karantindan chiqarish`), joriy run snapshot'ini
   o'qish (`didox:status`) kanallarini o'z ichiga olmaydi, vaholanki v2 va Web bo'limi ularga tayanadi.

→ **Nima qilish:** M8c uchun bitta "v5 — yakuniy M8c spetsifikatsiyasi" bo'limi yozing (0–13 qadam qayta, precheck/recovery qoidasi,
PUT tanasi + 409/400 jadvali, journal formati, IPC to'liq ro'yxati, TDD tartibi) va v1–v4 dagi ziddiyatli joylarga "v5 ga qarang"
deb belgi qo'ying; "Status", v3 M8d satri, spike "1–6/7" tozalansin; FR-8.4 qayta tiklangani rejaga yozilsin.

### B2. Didox'da saqlandi, lekin ilovada yozilmadi — barcha ketma-ketlik yo'llari yopilmagan (qoralama bor, ID yo'qolishi/dublikat)
Qadam 11 dan keyingi holatlarda **Didox'da haqiqiy qoralama bor**, shuning uchun har biri "ID yo'qolmasin + takror bo'lmasin" ni
talab qiladi. Reja faqat `RACE_ALREADY_MARKED` va "PUT yiqilsa 3× backoff → pending-marks.json" ni biladi. Qurilgan API esa quyidagilarni
beradi (`invoices.service.ts`):
- 409 `CONFIRMATION_REQUIRED` (`ALREADY_DRAFTED` / `POSSIBLE_DUPLICATE`) — tasdiq faqat buxgalterdan;
- 409 `AMOUNT_CHANGED` — run 30–90 daqiqa, buxgalter shu vaqt ichida operatsiya o'zgartirishi mumkin (ilova bloklamaydi);
  Didox'da **eski summali** qoralama qoladi, ilovada belgi yo'q;
- 409 `DRAFT_CHANGED` (parallel belgilash) — rejada eslatilmagan;
- 400 "Bu oy uchun foiz yo'q" (summa 0 ga tushdi) / "Faktura faqat tugagan oy uchun" — saqlangan, belgilab bo'lmaydi;
- tarmoq/API o'lishi (`main.ts`: API child `exit` → `showErrorBox` + `app.quit()` — reja aytgan "API_DOWN, run to'xtaydi, UI xabar" emas,
  ilova yopiladi, xotiradagi ID yo'qoladi).
Boshqa teshiklar: (a) ID topilgandan **PUT'dan oldin** diskka yozilmaydi (`saving` → PUT oralig'ida crash = keyingi run
qayta qidiradi; ishlaydi, lekin faqat precheck oynasi to'g'ri bo'lsa — B3), (b) `pending-marks.json` va run-journal ikki alohida
ombor — ikki joyda holat; bitta journal (`id_found{id}` holati bilan) yetarli, (c) bu 409/400 holatlari **faktura-darajali**, lekin
reja "faktura ichidagi har xato firmani to'xtatadi" deydi — shartli: nima firmani to'xtatadi, nima faqat shu fakturani `needs_check{id,reason}`
ga o'tkazadi, aniqlanmagan.

→ **Nima qilish:** journal holatlari: `pending → saving(at) → id_found(id) → marked | needs_check{id?, reason}`. Qoida: "Didox'da yaratildi,
API belgilamadi" **hech qachon** jim emas: ID, sabab ("Didox'dagi qoralamani tekshiring/o'chiring") run xulosasida va fakturalar
qatorida; `AMOUNT_CHANGED` uchun "Didox'da eski summali qoralama bor: ID …"; `confirmWarnings` ni ilova hech qachon yubormaydi,
UI'dagi buxgalter tugmasi yuboradi. Har holat uchun fake-API testi. `StepErrorCode`ga yangi kodlar (`SAVE_FAILED`, `SAVED_ID_UNKNOWN`,
`FORM_UNEXPECTED_VALUE`, `SIMILAR_DRAFT_EXISTS`, `LIST_TRUNCATED`, `AMOUNT_CHANGED`, `DRAFT_CONFLICT`, `API_UNAVAILABLE`) — hozir
`contract.ts` da yo'q.

### B3. Tiklash/precheck oynasi hali noto'g'ri tomonga ochiq: "`saveClickedAt − 2 daq … now`" buxgalterning keyingi qo'lda qoralamasini "o'zimniki" deb oladi
- B1(v2) qoidasi: STIR + shartnoma № + summa + UUIDv1 vaqti `[saveClickedAt−2min, now]` da aynan bitta `--white` qator → ID.
  `now` yuqori chegara sifatida xato: ilova karantin yaratdi (crash/timeout) → buxgalter Didox'da qoralamani **qo'lda** yaratdi
  (karantindagi xabarda aynan shu tavsiya) → keyingi run'da karantindagi faktura precheck qiladi → buxgalterning qo'lda qoralamasi oyna
  ichida, bitta mos → **boshqa odamning qoralamasi "ilovaniki" bo'lib `source:'didox'` bilan yoziladi**. Aynan shu ssenariy — "yo'qolgan
  ilovaniki yoki qo'lda yaratilgani" — ziddiyat. Yuqori chegara `saveClickedAt + save timeout + reload oynasi` (≈ +5 daq), `now` emas.
- Mos kalitida **shartnoma sanasi** yo'q (ro'yxat ustuni [6] — "shartnoma № **va sana**"). Bir juftlikda ikki shartnoma, raqami bir xil,
  sanasi har xil, summalari bir xil bo'lsa, run ichida ketma-ket saqlangan ikki qoralama bir-birining oynasiga tushadi (`−2 daq`) → ≥2 →
  `SAVED_ID_UNKNOWN`. Sana ham kalit bo'lsin (rejadagi "aniq parser" bandi shuni nazarda tutsa, matnda yozilsin).
- **Karantin ↔ precheck munosabati aniqlanmagan.** B2 (v2): `saving` qolgan = karantin, "avto-qayta urinish yo'q"; B1 (v2): `saving` yozuvi
  bor faktura uchun precheck ID **tiklaydi**. SRS FR-8.5: karantinni buxgalter qo'lda hal qiladi. Karantin faktura keyingi run'da
  (a) umuman o'tkazib yuboriladimi, (b) faqat o'qish-tiklash qilinadimi? Yozing: tavsiya — (b), tiklash faqat o'qiydi, topilmasa
  karantinda qoladi, **hech qachon yaratmaydi**.
- "O'xshash qoralama bor → to'xta" (B1.2) ning false-positive'i: oldingi oy qoralamasi hali imzolanmagan bo'lsa (SRS §9.1 misolida
  faktura keyingi oyning 15-sanasida) — 31 kunlik oylarda bir xil summa/shartnoma/№ → firma **har oy** to'xtaydi. Aniq, xavfsiz
  torayish bor: faktura oyi M bo'lsa, buxgalter M tugamasdan qoralama yarata olmaydi (FR: faqat tugagan oy) → UUIDv1 vaqti
  `M+1` oyning 1-sanasi 00:00 (Toshkent) dan **oldin** bo'lgan qator M fakturasining o'xshashi bo'la olmaydi, e'tiborsiz. (Spike'da
  UUIDv1 vaqti rost va server soatiga mos ekani tasdiqlansin — hozir bitta namuna.) Shundan keyin ham permanent block'dan chiqish yo'li kerak
  ("shu Didox ID'ni e'tiborsiz qoldirish" yoki "belgilash") — aks holda firma abadiy to'xtaydi.

### B4. Bekor qilish va watchdog qurilgan `run.ts`/`view.ts` bilan mos emas — rejadagi cancel-in-saving mumkin emas, 3 daqiqalik watchdog har real run'ni o'ldiradi
Dalil:
- `run.ts`: `WATCHDOG_MS = 180_000` butun run uchun; 30–90 daqiqalik M8c run 3 daqiqada `abort()` bo'ladi (progress bilan yangilanmaydi).
  `hardStop` yana 10 s dan keyin `current = null` (qulf) — step abort'ni e'tiborsiz qoldirsa, "zombi" run davom etib, yangi run bilan
  birga ikkinchi oyna/qadam ishlatishi mumkin (saqlash o'rtasida bo'lsa — dublikat xavfi).
- `view.ts` `alive()` har `goto/read/waitFor/click/type/sleep` boshida `signal.aborted` bo'lsa darhol `CANCELLED` otadi; `driver.step()` ham
  abort'dan keyin boshlanmaydi. Reja B2: "`saving` ichida bekor = saqlash tugashini kutish + ID qidirish". Bu **bitta** abort signal bilan
  bajarib bo'lmaydi: saqlash tugagach `locateDraftId` (goto/waitFor) birinchi chaqiruvdayoq CANCELLED beradi. Natija: har bekor qilish
  `saving` holatida qoladi → karantin (xavfsiz, lekin "bekor qilish yarim belgi qoldirmaydi" acceptance'iga zid: Didox'da qoralama bor, ilovada yo'q).
- `finally` → `win.close()` = `destroy()`; "Сақлаб қолиш" bosilgan, javob kelmagan paytda oyna yo'q qilinsa, server saqlagan bo'lishi mumkin.
- `main.ts` `win.on('closed', () => didox?.cancel())` va `before-quit` ≤5 s: `saving` ichida 5 s yetmaydi.
→ **Nima qilish:** (1) `saving → id_found/needs_check` oralig'ini **kritik bo'lim** qiling: ikkinchi (bekor qilinmaydigan, o'z timeout'li — masalan 30 s) signal;
bekor shu bo'lim tugagach qo'llanadi; `Page` shu rejimni qo'llashi kerak (yoki `step` `uninterruptible` flagi). (2) watchdog'ni
"oxirgi progress'dan beri N s" (heartbeat) yoki faktura-darajada qiling; `watchdogMs` M8c uchun olib tashlanadi/o'zgartiriladi. (3) hard-stop
da qulfni bo'shatishdan oldin eski run oynasi yopilganini kafolatlang (yoki yangi run eski run tugamaguncha boshlanmasin). (4) `before-quit`
kutish `saving` bo'lsa uzaytirilsin yoki journal'ga tayanib karantin deb qabul qilinsin (reja aytsin). (5) Test: fake page'da `cancel()`
saving ichida → ID topiladi va yoziladi.

---

## Major

### M1. Qurilgan kodga o'rnashish — interfeys o'zgarishlari ro'yxati reja'da yo'q
- **`run.ts` monolit:** `run(tin,…)` bitta firma uchun ketma-ketlik (listKeys → withPassword → preflight → oyna → reset → login → logout → finally close). M8c
  da oyna **butun run** uchun bir marta ochiladi, firma orasida `resetSession` (reja) — hozirgi kod har `checkLogin`da oynani ochib-yopadi.
  `loginFirm(win, tin)` ni ajratib, `checkLogin` va `createDrafts` ikkalasi ishlatsin; reja shu refaktorni aytmaydi. `DidoxRunnerDeps` ga `api`,
  `journal`, `createDraft` qadami, `clock` qo'shiladi; `start()` bloklamaydigan bo'lishi kerak (`didox:check-login` handler'i butun run'ni `await`
  qiladi; reja `create-drafts → {ok, runId}` deydi).
- **`ProgressEvent`** `{firmTin, step, status, message}` — faktura identifikatori (`contractId`, tartib `i/N`) yo'q, reja IPC'da `invoice?` deydi;
  `StepContext.tin` yagona; `emit` faqat firmTin. `Window.desktop.didox` va `apps/web/src/lib/desktop.ts` qo'lda "ikkalasini birga o'zgartiring" —
  kompilyator tekshirmaydi; umumiy tip yoki kontrakt testi.
- **`Page` da yetishmaydi:** (a) maydonni **tozalash** (`type` faqat qo'shadi; Сони sukut `1` bo'lsa "11" bo'ladi; sana niqobli maydonda eski qiymat),
  (b) `reload()` (reja `view.ts` ro'yxatida bor, `contract.ts` da yo'q; `goto(sameUrl)` bilan almashtirsa ham, shuni yozing),
  (c) select/MUI menyu uchun "variantni tanlash" yordamchisi (qadam 2/9 `needsPointer` bosishlari ketma-ketligi — kodda `login`dagi kalit menyusi
  namuna, lekin `FakePage` `waitFor`ni **poll qilmaydi** — "avtomatik to'ladi" kutishlarini (qadam 5, 6: 10 s) fake-page testlari isbotlay olmaydi).
- **`src/api/{jwt,client}.ts` mavjud emas.** M8b TDD'si (reja 221-qator) ularni M8b ga qo'ygan, lekin qurilmagan (`src/` da `api/` yo'q); M8c TDD'da
  yo'q → egasiz. M8c ning **birinchi** qadami: `mintSessionToken` + `createApiClient` + API e2e ("tashqarida HS256 `{sub}` cookie qabul qilinadi",
  `alg`/sir rad testlari — v2 "Boshqa" va'dasi).
- **REJECTING_CODES = `LOGIN_FAILED`** → har 45 s sustlik parolni `rejected` qiladi (M2 qarori). Ko'p-firmali run'da bu normal, lekin M8c dan
  keyin "Didox sekin" bilan "parol xato" farqlanmaydi → buxgalter parolni qayta kiritadi. Qaror qabul qilingan (M2); faqat toast matni bilan
  xabarda ajrating (hozir `awaitLogin` toast qo'shadi — yaxshi).
- **Logout:** `AFTER_LOGIN_CODES = {WRONG_FIRM}`. M8c qadamlarida (login'dan keyin barcha xatolar) `logout` chaqirilmaydi, lekin `finally → resetSession` Didox
  cookie/storage'ni tozalaydi — bu haqiqiy kafolat (`logout` kosmetik). Server-sessiya Didox tomonda tirik qoladi (token bekor qilinmaydi); plan buni bilishini yozsin.
  Savolga javob: login'dan keyingi **barcha** qadamlar (verifyFirm dan 13 gacha) "logged-in" holat; yagona majburiy tozalash `resetSession`.

### M2. Moliyaviy aniqlik (§7–11): ma'lumot manbai to'g'ri, taqqoslash matni eskirgan
Yaxshi: summa `GET /api/invoices` → `money(tiyin)` satri ("552328.77"), `expectedAmount` shu satr, API `toTiyin(...) !== interest` tekshiradi — bitta yadro.
Muammolar:
1. **Qadam 8 matni:** "normalizatsiya … `=== summa`" — satr tengligi. Didox "1" ni "1.00" ga yoki "552328.70" ni "552328.7" ga qisqartirishi mumkin → yolg'on
   `FORM_UNEXPECTED_VALUE`. M5 (v2) "BigInt parser" deydi; qadam matni yangilanmagan (B1 ga qo'shing).
2. **Desktop'da tiyin parseri hali yo'q.** Yangi parser **yaxlitlamasligi/kesmasligi** kerak: API `scaled()` ortiqcha kasrni `.slice(0, places)` bilan jim kesadi — o'qilgan
   "552328.765" ni o'sha mantiq bilan qabul qilish yolg'on moslik beradi. Talab: aniq format (`^\d+([.,]\d{1,2})?$` + NBSP/oddiy bo'shliq ming ajratgich), >2 kasr yoki noma'lum format = to'xtash.
   Chegara testlari: `0.01`, `0.10`, `1.00`, `552328.77`, `15904000000.10`, ming ajratgichli ko'rinishlar.
3. **Faqat Нарҳ emas:** `етказиб бериш нарҳи`, `Жами`, `ққс миқдор`, va qoralama ro'yxati ustuni [7] — hammasi shu parser orqali tiyinga o'tib `amount` bilan solishtirilsin
   (Сони=1 bo'lgani uchun hammasi teng; teng bo'lmasa — Didox kutilmagan hisoblagan, to'xta).
4. **Yozish formati:** Нарҳ maydoni yozilayotganda o'zi formatlashi (ming ajratgich, nuqta/vergul) yoki ikkinchi nuqtani rad etishi mumkin; yozilayotgan satr
   `Number()`/`toFixed` dan **emas**, tiyin BigInt'dan yasalgan format orqali bo'lsin (spike (2) kerakli kasr belgisini aniqlaydi). Kodda `Number(amount)` taqiqi lint/test.
5. **Run davomida summa o'zgarishi** (B2 ga qarang) — `expectedAmount` himoya, lekin Didox'da qoralama qoladi.

### M3. Spike ro'yxati (7 band) — kodsiz yozib bo'lmaydigan joylar to'liq emas va ikki band ziddiyatli
Spike hal qiladigan (reja bo'yicha): login (1), yozish usuli/niqob/MXIK/Нарҳ (2), origin matni va MUI select (3), saqlashdan keyingi ro'yxat (4), ikkinchi forma/session (5), endpoint nomlari (6), Windows (7).
Yetishmaydi / ziddiyat:
- **(7) Windows** M8c kodidan oldin talab qilingan, lekin Sir qarori (M9): Windows PC M8c **dan keyin** → (7) M8c bloklovchisi emas; ro'yxatdan chiqaring (v3 "1–6" to'g'ri edi).
- **(1) Electron 44**: B4 spike Electron **34.5.8** da o'tkazilgan (didox-flow §2b); 2026-10-12 da ilova Electron 44.7.0/Chromium 152 ga ko'tarildi (PROGRESS). Reja "Tekshirilgan faktlar" #1 va "Electron 34 EOL" eski.
  M8b real-Didox gate (Sir bilan, autotype bilan) PROGRESS bo'yicha hali o'tmagan ("keyin Sir bilan real kirish gate'i") → M8c spike/locators **M8b real gate'dan keyin** — tartib rejada yozilsin.
- **Save endpoint**: (6) faqat sign/send nomlarini yig'adi. `net-policy` `^(sign|tosign|send)$` segmentni **istalgan host/metod**da bloklaydi; "Сақлаб қолиш" XHR'i yo'lida shunday segment bo'lsa, saqlash jim to'siladi (UI xato toast → `SAVE_FAILED`, har faktura). Spike saqlash endpoint'ini yozib olsin va `classifyRequest(saveUrl)==='allow'` regression testi bo'lsin.
- **Til/locale:** barcha locator matnlari kirill o'zbekcha (`Кириш`, `Калитингизни танланг`, `Ҳисоб-фактура актсиз`…). `resetSession` Didox tilini ham (localStorage/cookie) tozalaydi, Electron `Accept-Language` OS tilidan keladi (O'zbekistonda ruscha Windows keng tarqalgan). Birinchi ochilishda til qaysi? Spike: toza sessiyada, `ru-RU` va `en-US` tizim tilida tilni tekshirish; tilni majburlash usuli (URL/cookie/`Accept-Language`) yoki til-mustaqil locator.
- **Oyna fonda/yopiq/disabled:** `view.ts` da `backgroundThrottling:false` yo'q; `win.setEnabled(false)` + oyna ustida boshqa ilova (buxgalter 30–90 daqiqa ishlaydi) + occlusion → timer/rAF sekinlashishi, `sendInputEvent({type:'char'})` fokussiz sahifada React hodisalarini ishga tushirishi (MUI Autocomplete fokus/klik talab qiladi), `capturePage` osilishi. v2/M7 "spike'da tasdiqlanadi" degan, lekin 7 bandda yo'q. Qo'shing, va `powerSaveBlocker.start('prevent-display-sleep')` (ekran uyqusi/qulfi 60+ daqiqalik run'ni buzadi; hozir rejada yo'q).
- **Shartnoma №** formatlari: sinov `TEST-1`; haqiqiyda `/`, bo'shliq, lotin/kirill aralash bo'lishi mumkin; niqob/uzunlik cheklovi va `sendInputEvent`ning kirill belgilarni qabul qilishi ((2) ga qo'shing).
- **Kontragent qidiruvi:** STIR Didox reestrida yo'q yoki filial (MUI "Филиал") talab qilinadigan holat; to'lish "stale" ma'lumotga mos kelib qolmasligi (qadam 5 "Номи to'lishi" — oldingi qiymat qolsa darhol o'tadi). (2) da.
- **Forma tashlanganda server-tomon avto-saqlash** yo'qligi (autosave bo'lsa "yarim forma tashlanadi" xavfsiz emas).
- **UUIDv1 vaqti** (B3 uchun asos) — bir marta kuzatilgan; kamida 3–5 qoralamada tasdiqlash, server vs lokal soat farqi.
- **fixture/drift detektor**: real forma HTML'i sotuvchi rekvizitlarini (firma nomi, direktor) o'z ichiga oladi — SRS §9.1 "haqiqiy rekvizitlar repo'ga yozilmaydi"; fixture sanitizatsiya qilinishi kerak.
Aniq javob "kodsiz yozib bo'lmaydigan": `ORIGIN_SERVICE_LABEL` matni (hozir ham SRS ichida ikki xil: §9.1 "Оказание услуг", didox-flow "Хизмат кўрсатиш"), MXIK autocomplete variantlari soni, Нарҳ/Жами o'qish formati, yozish usuli (sendInputEvent vs execCommand), select qiymatlari — spike bu 5 tasini yopishi shart; locators.ts forma qismini shundan keyin yozing.

### M4. Qadamlar bo'yicha to'xtash semantikasi (§15) — izchillik jadvali yo'q, ikki joyda amaliy nomuvofiqlik
- 0–10: forma holati tashlanadigan (Didox'da hech narsa yo'q) → to'xtash xavfsiz. 11–13: noaniq/Didox'da qoralama bor (B2). Rejada bu chegara aniq chizilmagan; hozir hamma narsa "StepError → firma".
- **Fakturaga xos deterministik xato firmani har oy bloklaydi:** kontragent Didox reestrida topilmasa, shartnoma № formati qabul qilinmasa, MXIK/select kutilmagan — keyingi fakturalar ham yaratilmaydi, va keyingi oyda yana shu faktura birinchi turib yana to'xtaydi. §15 ("to'xtash, taxmin yo'q") buzmasdan: faktura **saqlashdan oldingi** (0–10) xatosida firma to'xtaydi, lekin buxgalterga "shu fakturani o'tkazib yuborish" (journal'da `skipped_by_user` — keyingi run'da ham) yo'li bo'lsin. Bu — Sir bilan hal qilinadigan qaror (Ochiq savol).
- Qadam 1 "Диққат!" 3 s kutish: kech chiqsa keyingi bosishlar `covered` (pointerClick) beradi → `PAGE_UNEXPECTED` firma-stop. Modal yopilishini ("yo'q bo'lguncha") kutish, "yo'q" deb bo'sh o'tmaslik.
- Qadam 5 (nom to'lishi) log'ga yoziladi, **solishtirilmaydi**: ilovada STIR xato terilgan bo'lsa qoralama noto'g'ri kontragentga yaratiladi. Kamida: run xulosasida "Didox'da topilgan nom: …" ko'rsatilsin, yoki normallashtirilgan nom ilovadagi nom bilan yumshoq taqqoslansin va farqda to'xtasin (CONSTITUTION §2 "taxmin yo'q").
- Qadam 11: URL o'tmasa va xato toast yo'q (20 s) → `TIMEOUT` firma-stop; `saving` qoladi (to'g'ri, karantin). Lekin aniq `SAVE_FAILED` toast ham saqlanmaganini **isbotlamaydi** (504 commit'dan keyin): `saving` ni o'chirish emas, karantinda qoldirish yoki 12-qadamdagi qidiruvdan o'tkazish — qaysi biri ekanini yozing.

### M5. Vertical slice va hajm: M8c qatlam-bo'yicha TDD, birinchi foydalanuvchi ko'rinadigan natija eng oxirida
TDD tartibi: API → locators → steps → run → IPC → web. Bitta fakturani tugagunga qadar hech narsa ko'rinmaydi, oraliq gate (`maxInvoices:1`) esa shu oxirgi qadamdan keyin. Hajm: 14 qadam + service JWT/API client + journal + karantin + cancel + IPC + dialog + karantin UI — bitta modul uchun juda katta.
→ Ikki vertikal bo'lakka bo'ling: **c1** = bitta faktura end-to-end (tugma → IPC → run (bitta firma) → qadamlar → PUT → qator "Qoralama yaratildi (Didox)"), journal minimal (`saving`/`marked`), oraliq gate `maxInvoices:1`. **c2** = ko'p faktura/firma, karantin va tiklash, cancel kritik bo'limi, run tarixi, karantin UI. Oraliq gate c1 dan keyin, karantin/cancel c2 dan keyin real Didox'da tekshiriladi.

### M6. UI/IPC bo'shliqlari
- Faktura qatorlarida **karantin / needs_check holati** va amallar ("Belgilash", "Karantindan chiqarish", "Didox ID …") Web bo'limida yo'q (faqat dialog + `DidoxRunsCard`). Karantin faqat lokal fayl (API qatori `draft===null` bo'lib ko'rinadi) → UI IPC dan journal bilan API qatorlarini birlashtirishi kerak.
- SPA'da dialog yopilsa/sahifa almashsa jonli progress yo'qoladi; renderer reload'da run tirik qoladi (`sendProgress` faqat oqim). `didox:status` (joriy run snapshot) kerak.
- Run davomida buxgalter operatsiya tahrirlay oladi (summa o'zgaradi — `AMOUNT_CHANGED`) yoki ikkinchi marta "Belgilash" bosa oladi. Ilova faktura sahifasini "Didox bilan ishlanmoqda" holatida bloklasa (kamida shu oy fakturalarini) ko'plab 409 yo'qoladi; hozir faqat Didox oynasi bloklangan.
- `win.on('closed', cancel)` hozirgi xulq M8d tray rejimiga zid bo'ladi; M8d da qayta ko'riladi (eslatma).

### M7. Rejadagi "tekshirilgan fakt"lar eskirgan yoki tekshirilmagan
- #1 "Electron 34/Node 20/global WebSocket yo'q" — ilova 44.7.0 (Node 24); `ws` qoladi, lekin B4/spike natijalari 34.5.8 uchun (M3 yuqorida).
- #5 Qoralama ro'yxati: `limit=20` sukut, `limit=100`+`LIST_TRUNCATED` (M5 v2) kodlangan emas; ro'yxat tartibi/ustun joylari faqat bitta qoralama bilan xaritalangan (2 ta firma × bir necha qoralama bilan emas) — spike (4) buni yopishi kerak, lekin qabul mezoni yozilmagan.

---

## Minor
- `already` natijasi (v1 qadam 0) v2 da `recovered` bo'lishi kerak; UI matni "Qoralama yaratildi" emas, "Didox'da topildi" bo'lishi mumkin.
- `maxInvoices` renderer'dan keladigan IPC parametri — dev-toggle'ni prod IPC'ga ochmaslik (main env/flag orqali).
- `lenderIds` — ichki UUID; M3 validatsiya (uuid, ≤200) shu; `month` regex API'dagi `MONTH` bilan bir xil bo'lsin.
- Tezlik hisobi: 60–90 s/faktura × 2 firma × N; 40 fakturada ~1 soat — ish davomida E-IMZO paroli per-firma bir marta; kirish `rejected` bo'lsa o'sha run'da qolgan firmalar davom etadi (SRS FR-8.8) — IPC xulosasida firma bo'yicha ko'rsating.
- `diagnostics` screenshot'larida kontragent/direktor ko'rinadi (reja M7 qabul qilgan: lokal, 20 ta) — yangi qadam xatolarida sotuvchi bloki ham ko'rinadi; "oxirgi 20 ta" yetarli.
- `FORBIDDEN_LABEL` hozir `elementFromPoint` yorlig'ini ham tekshiradi (yaxshi), lekin katta konteyner yorlig'i (matni ichida "Имзолаш" bor sahifa qismi) `pointer` bosishda yolg'on `FORBIDDEN_ACTION` berishi mumkin — selector konkret element beradigan bo'lsin (qadam 9 MUI menyu uchun).
- `Page.type` har belgi 40–80 ms: 17 belgili MXIK + ~20 belgili boshqa maydonlar ≈ 3–4 s/faktura (reja tezlik hisobiga kiradi) — OK.

## Ochiq savol (Sir/Fable'ga)
1. Faktura saqlashdan oldingi deterministik xato (kontragent topilmadi va h.k.) — firma to'xtaydi, lekin "shu fakturani o'tkazib yuborish" doimiy belgisi kerakmi (M4)?
2. Karantin faktura keyingi run'da read-only tiklashga uriniladimi (tavsiya) yoki butunlay buxgalter qo'lida (SRS FR-8.5 so'zma-so'z)?
3. Run vaqtida ilovaning faktura/operatsiya tahririni bloklash — qabul qilinadimi (M6)?
4. Windows spike (7) M8c bloklovchisidan chiqarilsin — tasdiqlaysizmi (M9 qarori bilan mos)?

---

## Tekshirilgan va yaxshi
- Summa manbai: `invoiceRow.amount = money(interest)` (BigInt tiyin → satr), `expectedAmount` ↔ `toTiyin(...) !== interest` API tomonida; renderer summa yubormaydi — §11 bo'yicha bitta yadro.
- Sign/send uch qavat: `FORBIDDEN_LABEL` (Page.click), `clickScript` ichida tekshiruv + `pointerClick` mouseUp'dan oldin qayta tekshiruv (hodisa yuborilmaydi), `net-policy` segment bloki — saqlash tugmasi bilan "Имзолаш" qo'shni bo'lgani uchun muhim, to'g'ri.
- `driver.step()`: qayta urinish yo'q, xatoda screenshot, kutilmagan xato → `PAGE_UNEXPECTED`; StepError kodlari CANCELLED'dan keyin ham saqlanadi.
- Parol oqimi: `eri.withPassword(tin, fn, serial)` faqat `armAutotype` ichida, `run.ts` kalit seriyasini uzatadi; M8c shu pipeline'ni o'zgartirmasdan qayta ishlatadi.
- `invoice_drafts.source` migratsiyasi: `NOT NULL DEFAULT 'manual'` + CHECK → mavjud ma'lumotga xavfsiz; yozuv `write()` `updatedAt` bilan shartli (`DRAFT_CHANGED`) — concurrency API tomonida yopilgan.
- Tashqi qatlam chegaralari (IPC guard `isTrustedSender`, tin regex, `AbortController` bilan sleep/wait) M8c IPC'ga to'g'ri kengayadi.
- Kontragent rekvizitlarini ilova yozmaydi (faqat STIR) — Didox auto-to'ldiradi; YAGNI-ga mos.
- Operatsion qarorlar (B1 precheck torayishi, write-ahead g'oyasi, `limit` fail-closed, UUIDv1 oynasi) — mantiqiy yo'nalish to'g'ri; yuqoridagi blocker'lar ularning **detallari**ga tegadi.
