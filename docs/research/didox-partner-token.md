# Didox: firma paroli va partner token olish tartibi

Sana: 2026-10-07. Belgilar: **[TASDIQLANDI]** — rasmiy manbada; **[XULOSA]** — manbadan chiqarilgan
xulosa; **TEKSHIRILMADI** — ochiq manbada yo'q, Didox'dan so'raladi.

---

## 1. "Firma paroli" — ERI paroli emas

Bular **ikki xil** parol:

| | ERI (.pfx) paroli | Didox akkaunt paroli |
|---|---|---|
| Nimani himoya qiladi | Kompyuterdagi ERI kalit faylini | Didox'dagi akkauntni |
| Qayerda ishlatiladi | E-IMZO dasturi, kalitni ochishda (imzolash va ERI bilan kirish) | Didox'ga **ERI'siz** kirishda (mobil ilova, API) |
| Qayerda o'rnatiladi | ERI kaliti berilganda | **Didox'da ro'yxatdan o'tishda** |
| Talab | — | kamida 8 belgi: harf, raqam, maxsus belgi |

Dalillar:
- API login: `POST /v1/auth/{taxId}/password/{locale}` — "Вход без ЭЦП по паролю, заданному при
  регистрации". [TASDIQLANDI] [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- Ro'yxatdan o'tish (`POST /v1/auth/signup`) majburiy maydon `password` — "Пароль для входа без ЭЦП.
  Мин. 8 символов: буквы, цифры и спецсимволы". Ya'ni har bir Didox akkauntida ro'yxatdan
  o'tishdanoq parol bor. [TASDIQLANDI] [api-docs.didox.uz/ru/integrators-registration](https://api-docs.didox.uz/ru/integrators-registration)
- Parolni o'zgartirish: `POST /v1/account/update` maydoni `password` — "Новый пароль". [TASDIQLANDI]
  [api-docs.didox.uz/ru/integrators-account](https://api-docs.didox.uz/ru/integrators-account)
- Didox Mobile (2024-07-22): "Вход будет осуществляться только через номер телефона и по паролю". [TASDIQLANDI]
  [t.me/s/didox_info](https://t.me/s/didox_info?q=%D0%BF%D0%B0%D1%80%D0%BE%D0%BB)

Muhim:
- [XULOSA] Buxgalter odatda ERI bilan kirgani uchun Didox parolini **unutgan** bo'lishi mumkin. Unda ERI bilan
  kirib, profil sozlamalarida yangi parol o'rnatadi. Didox web UI'dagi aniq yo'l (menyu) — TEKSHIRILMADI.
- [XULOSA] `taxId` — akkaunt egasining INN/PINFL'i. Firma ERI'si (yuridik shaxs) bilan ro'yxatdan o'tgan
  bo'lsa — firma INN'i bilan kiriladi. Agar buxgalter jismoniy shaxs (PINFL) sifatida kirib, firmaga
  ulangan bo'lsa — avval PINFL bilan, keyin `POST /v1/auth/company/{companyTaxId}/login` bilan firmaga.
  Har firma qaysi turda ekanini buxgalter aytadi.
- ⚠️ Noto'g'ri parol: 3/daq → 10 daq blok; 10 → 24 soat; **25 → doimiy blok**. [TASDIQLANDI]
  [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- [XULOSA] Parol bilan imzolab bo'lmaydi — imzo uchun E-IMZO (ERI) kerak; shuning uchun serverdagi parol
  qoralama yaratishga yetadi, lekin hujjatni yubora olmaydi.

---

## 2. Partner token — tartib

### Rasmiy manbada bor narsa [TASDIQLANDI]
- "Чтобы использовать API необходимо получить партнерский токен … необходимо обратиться к Аккаунт
  менеджеру: https://t.me/Didox_account ; +998 50 122 05 18". [api-docs.didox.uz/ru/home](https://api-docs.didox.uz/ru/home)
- Test URL: `https://testapi3.didox.uz/`, prod: `https://api-partners.didox.uz/`.
- API o'zgarishlari kanali: [t.me/didoxapiupdates](https://t.me/didoxapiupdates) — Didox u yerda
  integratorlarni "Хурматли хамкорлар" deb chaqiradi.

### Ochiq manbada YO'Q (TEKSHIRILMADI — account manager'dan so'raladi)
- Partner token narxi / to'lovi
- Shartnoma yoki oferta imzolash kerakmi, kim nomidan (mijoz firmasi yoki dasturchi)
- Test token'ni qancha vaqtda beradi; test kompaniyalar va parollar
- IP whitelist, so'rovlar limiti (login'dan tashqari)

### Hujjat yuborish narxi (oddiy Didox tarifi) [TASDIQLANDI]
01.09.2025 dan (2026-yilda yangi e'lon topilmadi): oyiga 10 tagacha hujjat — bepul; 11–100 — 800 so'm;
101–1000 — 500 so'm; 1001–10 000 — 400 so'm; 10 000+ — 350 so'm/hujjat. "Применяются к документам,
отправленным". [t.me/s/didox_info](https://t.me/s/didox_info?q=%D1%82%D0%B0%D1%80%D0%B8%D1%84)
- [XULOSA] Ilova faqat **qoralama** yaratadi; pul buxgalter imzolab **yuborganda** yechiladi — bu hozirgi
  qo'lda jarayonda ham shunday. Ya'ni ilova qo'shimcha hujjat narxi qo'shmaydi. Qoralama bepulligi —
  TEKSHIRILMADI.

### Tavsiya etilgan qadamlar
1. **Kim partner bo'ladi** — kelishib oling: mijoz (firmalar egasi) yoki dasturchi. [XULOSA] Prod token
   mijoz nomida bo'lgani ma'qul — integratsiya ularniki; dasturchi test token'ni o'zi olishi mumkin.
2. **Account manager'ga yozish** — Telegram `@Didox_account` yoki +998 50 122 05 18 (quyidagi xabar namunasi).
3. **Test token olish** → `testapi3.didox.uz` da sinov: parol bilan kirish, 002 qoralama yaratish,
   bo'sh raqam/sana, "Без НДС" maydonlari.
4. **Har beruvchi firma:** Didox parolini aniqlash/tiklash (1-bo'lim).
5. **Prod token** → ilovada sozlash (server `.env`, repo'da emas).
6. `@didoxapiupdates` kanaliga obuna — API o'zgarishlari shu yerda e'lon qilinadi.

### Account manager'ga xabar namunasi
> Assalomu alaykum. Biz ichki buxgalteriya ilovasini Didox API bilan integratsiya qilmoqchimiz.
> Maqsad: o'zimizning bir nechta MCHJ nomidan "Ҳисоб-фактура актсиз" (doctype 002) **qoralamalarini**
> API orqali yaratish. Imzolash va yuborish buxgalter tomonidan Didox'da qo'lda qilinadi; API orqali
> imzolamaymiz. Oyiga taxminan __ ta hujjat, __ ta firma.
>
> Iltimos, quyidagilarni ma'lum qiling:
> 1. Partner token olish shartlari va narxi; shartnoma/oferta kerakmi va kim nomidan?
> 2. Test muhiti (testapi3.didox.uz) uchun token va test kompaniyalar.
> 3. Parol bilan kirish (`/v1/auth/{taxId}/password`) orqali qoralama yaratishga ruxsat bormi?
> 4. Qoralamani `FacturaNo` va `FacturaDate` bo'sh holda saqlash mumkinmi?
> 5. MXIK 10401999001000000, "Без НДС" uchun `LgotaId` qanday to'ldiriladi?
> 6. IP whitelist yoki so'rovlar limiti bormi?
